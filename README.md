# Trello github automation

Automatically update Trello cards when opening / merging GitHub Pull Requests.

Include one or more card id's in you commit messages in the format of `T-${shortId}`, and trello will
automatically assign the Pull Request and move the card in the correct column.

The git branches should be `develop`, `candidate` and `release` or `master`.
You can define which board and column they map to, depending on the GitHub
repository.

# Getting started

install the dependencies

```bash
npm ci
```

set environment variables

```bash
export GITHUB_WEBHOOK_SECRET="xxx"
export GITHUB_TOKEN="xxx"
export TRELLO_TOKEN="xxx"
export TRELLO_KEY="xxx"
export TRELLO_IDS='
{
    "123 (GitHub repo id)": {
        "TRELLO_BOARD_ID": "abc",
        "TRELLO_COLUMN_OPEN": "abc",
        "TRELLO_COLUMN_DEV": "abc",
        "TRELLO_COLUMN_CAN": "abc",
        "TRELLO_COLUMN_REL": "abc"
    }
}
'
```

You can get the Trello secret and key here.
[https://trello.com/app-key/](https://trello.com/app-key/)

Define the GitHub hook and secret here
[https://github.com/your/repo/settings/hooks/new](https://github.com/adgorithmics-inc/cinnamon/settings/hooks/new)
(set the "Content type" to `json` and select "Let me select individual events." and "Pull requests")

---

inspired by https://github.com/nachoesmite/trello-github-power-up
