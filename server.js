const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

app.post('/', async (req, res) => {
    const {
        GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
        GITHUB_TOKEN: githubToken,
        TRELLO_TOKEN: trelloToken,
        TRELLO_KEY: trelloKey,
        TRELLO_IDS,
    } = process.env;

    const hmac = crypto.createHmac('sha1', githubWebhookSecret);
    hmac.update(JSON.stringify(req.body));

    if (`sha1=${hmac.digest('hex')}` !== req.headers['x-hub-signature']) {
        res.status(400);
        return res.send('wrong secret');
    }

    if (!req.body.pull_request) {
        console.log('Not a pull request');
        return res.send('OK');
    }

    const { action } = req.body;
    const {
        html_url: PRUrl,
        title: PRTitle,
        merged,
        head: { ref: headRef },
        base: {
            ref: baseRef,
            repo: { id: repoId },
        },
        commits_url: commitsUrl,
    } = req.body.pull_request;

    console.log(`Processing ${PRTitle}`);

    const {
        TRELLO_BOARD_ID: trelloBoardId,
        TRELLO_COLUMN_OPEN: trelloColumnOpen,
        TRELLO_COLUMN_DEV: trelloColumnDev,
        TRELLO_COLUMN_CAN: trelloColumnCan,
        TRELLO_COLUMN_REL: trelloColumnRel,
    } = JSON.parse(TRELLO_IDS)[repoId];

    if (PRTitle.match(/[y|Y]ank/)) {
        return res.send('OK');
    }

    if (
        action === 'opened' ||
        action === 'reopened' ||
        action === 'synchronize'
    ) {
        if (
            headRef === 'develop' ||
            headRef === 'candidate' ||
            headRef === 'release' ||
            headRef === 'master'
        ) {
            return res.send('OK');
        }

        const trelloShortLinks = await getTrelloShortLinks(
            commitsUrl,
            githubToken,
            trelloBoardId,
            trelloKey,
            trelloToken,
        );

        trelloShortLinks.forEach(async shortLink => {
            const attachments = await getTrelloTicketAttachment(
                shortLink,
                trelloKey,
                trelloToken,
            );
            for (const attachment of attachments) {
                if (attachment.url === PRUrl) {
                    return;
                }
            }
            console.log(`update trello ticket ${shortLink}`);
            await updateTrelloTicketAttachment(
                shortLink,
                trelloKey,
                trelloToken,
                {
                    name: PRTitle,
                    url: PRUrl,
                },
            );
            console.log(`move trello ticket ${shortLink}`);
            await moveTrelloTicketToColumn(
                shortLink,
                trelloColumnOpen,
                trelloKey,
                trelloToken,
            );
        });
    }

    if (action === 'closed' && merged) {
        const trelloShortLinks = await getTrelloShortLinks(
            commitsUrl,
            githubToken,
            trelloBoardId,
            trelloKey,
            trelloToken,
        );

        if (
            baseRef === 'develop' &&
            headRef !== 'candidate' &&
            headRef !== 'release' &&
            headRef !== 'master'
        ) {
            trelloShortLinks.forEach(async shortLink => {
                console.log(`move trello ticket ${shortLink}`);
                await moveTrelloTicketToColumn(
                    shortLink,
                    trelloColumnDev,
                    trelloKey,
                    trelloToken,
                );
            });
        }

        if (
            baseRef === 'candidate' &&
            headRef !== 'release' &&
            headRef !== 'master'
        ) {
            trelloShortLinks.forEach(async shortLink => {
                console.log(`move trello ticket ${shortLink}`);
                await moveTrelloTicketToColumn(
                    shortLink,
                    trelloColumnCan,
                    trelloKey,
                    trelloToken,
                );
            });
        }

        if (baseRef === 'release' || baseRef === 'master') {
            trelloShortLinks.forEach(async shortLink => {
                console.log(`move trello ticket ${shortLink}`);
                await moveTrelloTicketToColumn(
                    shortLink,
                    trelloColumnRel,
                    trelloKey,
                    trelloToken,
                );
            });
        }
    }

    res.send('OK');
});

app.listen(2224, () => console.log('Started server'));

const getTrelloShortLinks = async (
    commitsUrl,
    githubToken,
    trelloBoardId,
    trelloKey,
    trelloToken,
) => {
    const commitMessages = (await getCommits(commitsUrl, githubToken)).map(
        item => item.commit.message,
    );

    const trelloIds = [
        ...new Set(
            commitMessages.reduce((ids, message) => {
                const parts = message.split(' ');
                while (true) {
                    const part = parts.shift();
                    if (!part.match(/T-[0-9]+/)) {
                        break;
                    }
                    ids.push(parseInt(part.replace('T-', '')));
                }
                return ids;
            }, []),
        ),
    ];

    const trelloTickets = await getTrelloTickets(
        trelloBoardId,
        trelloKey,
        trelloToken,
    );

    return [
        ...new Set(
            trelloTickets
                .filter(ticket => trelloIds.includes(ticket.idShort))
                .map(ticket => ticket.shortLink),
        ),
    ];
};

const getCommits = async (url, githubToken) => {
    const fullResult = [];
    let page = 1;

    while (true) {
        const result = await requestPromise({
            url: `${url}?page=${page}`,
            method: 'GET',
            headers: {
                'User-Agent': 'trellobot',
                Authorization: `token ${githubToken}`,
            },
        });
        if (!result.length) {
            break;
        }
        page++;
        fullResult.push(...result);
    }

    return fullResult;
};

const getTrelloTickets = (boardId, key, token) =>
    requestPromise({
        url: `https://api.trello.com/1/boards/${boardId}/cards/visible`,
        method: 'GET',
        qs: { token, key },
    });

const updateTrelloTicketAttachment = (shortLink, key, token, data) =>
    requestPromise({
        url: `https://api.trello.com/1/cards/${shortLink}/attachments`,
        method: 'POST',
        qs: { token, key, ...data },
    });

const getTrelloTicketAttachment = (shortLink, key, token) =>
    requestPromise({
        url: `https://api.trello.com/1/cards/${shortLink}/attachments`,
        method: 'GET',
        qs: { token, key },
    });

const moveTrelloTicketToColumn = (shortLink, value, key, token) =>
    requestPromise({
        url: `https://api.trello.com/1/cards/${shortLink}/idList`,
        method: 'PUT',
        qs: { token, key, value },
    });

const requestPromise = ({ url, method, qs = {}, headers = {} }) =>
    new Promise((resolve, reject) =>
        request({ url, method, qs, headers }, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(JSON.parse(result.body));
        }),
    );
