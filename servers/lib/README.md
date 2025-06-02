# Overview

The **lib microservice** is a simplified file manager which serves files
from local file system or public git repositories. It is possible to

- Upload and download files from web browser
- Query available files and download them using GraphQL API
- Clone public git repositories and serve them as local files

## :arrow_down: Install

### Default NPM Registry

The default registry for npm packages is [npmjs](https://registry.npmjs.org).
Install the package with the following commands

```bash
npm install -g @into-cps-association/libms
```

### Github NPM Registry

The package is also available in Github
[packages registry](https://github.com/orgs/INTO-CPS-Association/packages).

Set the registry and install the package with the following commands

```bash
npm config set @into-cps-association:registry https://npm.pkg.github.com
npm install -g @into-cps-association/libms
```

The _npm install_ command asks for username and password. The username is
your Github username and the password is your Github
[personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
In order for the npm to download the package, your personal access token
needs to have _read:packages_ scope.

## :gear: Configure

The microservices requires config specified in yaml format.
The template configuration file is:

```yaml
port: '4001'
mode: 'local' #git or local
local-path: '..\..\files'
log-level: 'debug'
apollo-path: '/lib'
graphql-playground: 'true'

git-repos: #only used in git mode
  - user1:
      repo-url: 'https://gitlab.com/dtaas/user1.git'
  - user2:
      repo-url: 'https://gitlab.com/dtaas/user2.git'
  - common:
      repo-url: 'https://gitlab.com/dtaas/common.git'
```

The `local-path` variable is the relative filepath to the
location of the local directory which will be served to users
by the Library microservice.

Replace the default values the appropriate values for your setup.
Please save this config in a file as a yaml file, for example as `libms.yaml`.

### Operation Modes

The mode indicates the backend storage for the files.
There are two possible modes - `local` and `git`.
The files available in the `local-path` are served to users in `local` mode.
In the `git` mode, the remote git repos are cloned and they are
served to users as local files.

#### git mode

A fragment of the config for `git` mode is:

```yaml
---
git-repos:
  - user1:
      repo-url: 'https://gitlab.com/dtaas/user1.git'
  - user2:
      repo-url: 'https://gitlab.com/dtaas/user2.git'
  - common:
      repo-url: 'https://gitlab.com/dtaas/common.git'
```

Here, `user1`, `user2` and `common` are the local directories into which
the remote git repositories get cloned. The name of the repository need not
match with the local directory name. For example, the above configuration
enables library microservice to clone
`https://gitlab.com/dtaas/user1.git` repository into
`user1` directory. Any git server accessible over
HTTP(S) protocol is supported.
The `.git` suffix is optional.

## :rocket: Use

Display help.

```bash
$libms -h
Usage: libms [options]

The lib microservice is a file server. It supports file transfer
over GraphQL and HTTP protocols.

Options:
  -c, --config <file>  provide the config file (default libms.yaml)
  -H, --http <file>    enable the HTTP server with the specified config
  -h, --help           display help for libms
```

Both the options are not mandatory.

### Configuration file

The config is saved `libms.yaml` file by convention. If `-c` is not specified
The **libms** looks for
`libms.yaml` file in the working directory from which it is run.
If you want to run **libms** without explicitly specifying the configuration
file, run

```bash
libms
```

To run **libms** with a custom config file,

```bash
libms -c FILE-PATH
libms --config FILE-PATH
```

If the environment file is named something other than `libms.yaml`,
for example as `config/libms.yaml.default`, you can run

```sh
libms -c "config/libms.yaml.default"
```

You can press `Ctl+C` to halt the application.

### Protocol Support

The **libms** supports GraphQL protocol by default.
It is possible to enable the HTTP protocol by setting
the `-H` option.

To run **libms** with a custom config for HTTP protocol, use

```bash
libms -H FILE-PATH
libms --http FILE-PATH
```

<details>
<summary>Please see this sample HTTP config file</summary>

```json
{
  "name": "DTaaS Fileserver",
  "auth": false,
  "editor": "edward",
  "packer": "zip",
  "diff": true,
  "zip": true,
  "buffer": true,
  "dirStorage": true,
  "online": false,
  "open": false,
  "oneFilePanel": true,
  "keysPanel": false,
  "prefix": "/lib/files",
  "confirmCopy": true,
  "confirmMove": true,
  "showConfig": false,
  "showDotFiles": false,
  "showFileName": true,
  "contact": false,
  "configDialog": false,
  "console": false,
  "terminal": false,
  "vim": false,
  "columns": "name-size-date-owner-mode",
  "export": false,
  "import": false,
  "dropbox": false,
  "dropboxToken": "",
  "log": true
}
```

</details>

## Application Programming Interface (API)

The lib microservice application provides services at
two end points:

### HTTP protocol

Endpoint: `localhost:PORT/lib/files`

This option needs to be enabled with `-H http.json` flag.
The regular file upload and download options become available.

### GraphQL protocol

Endpoint: `localhost:PORT/lib`

<details>
<summary>GraphQL API details</summary>
The lib microservice takes two distinct GraphQL queries.

#### Directory Listing

This query receives directory path and provides list of files
in that directory. A sample query and response are given here.

```graphql
query {
  listDirectory(path: "user1") {
    repository {
      tree {
        blobs {
          edges {
            node {
              name
              type
            }
          }
        }
        trees {
          edges {
            node {
              name
              type
            }
          }
        }
      }
    }
  }
}
```

```graphql
{
  "data": {
    "listDirectory": {
      "repository": {
        "tree": {
          "blobs": {
            "edges": []
          },
          "trees": {
            "edges": [
              {
                "node": {
                  "name": "common",
                  "type": "tree"
                }
              },
              {
                "node": {
                  "name": "data",
                  "type": "tree"
                }
              },
              {
                "node": {
                  "name": "digital twins",
                  "type": "tree"
                }
              },
              {
                "node": {
                  "name": "functions",
                  "type": "tree"
                }
              },
              {
                "node": {
                  "name": "models",
                  "type": "tree"
                }
              },
              {
                "node": {
                  "name": "tools",
                  "type": "tree"
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

#### Fetch a File

This query receives directory path and send the file contents to user in response.

To check this query, create a file `files/user2/data/welcome.txt`
with content of `hello world`.

A sample query and response are given here.

```graphql
query {
  readFile(path: "user2/data/sample.txt") {
    repository {
      blobs {
        nodes {
          name
          rawBlob
          rawTextBlob
        }
      }
    }
  }
}
```

```graphql
{
  "data": {
    "readFile": {
      "repository": {
        "blobs": {
          "nodes": [
            {
              "name": "sample.txt",
              "rawBlob": "hello world",
              "rawTextBlob": "hello world"
            }
          ]
        }
      }
    }
  }
}
```

### Direct HTTP API Calls in lieu of GraphQL API Calls

The lib microservice also supports making API calls using HTTP POST requests.
Simply send a POST request to the URL endpoint with the GraphQL query in
the request body. Make sure to set the Content-Type header to
"application/json".

The easiest way to perform HTTP requests is to use
[HTTPie](https://github.com/httpie/desktop/releases)
desktop application.
You can download the Ubuntu AppImage and run it. Select the following options:

```txt
Method: POST
URL: localhost:4001
Body: <<copy the json code from examples below>>
Content Type: text/json
```

Here are examples of the HTTP requests and responses for the HTTP API calls.

#### Directory listing

<!-- markdownlint-disable MD013 -->

```http
POST /lib HTTP/1.1
Host: localhost:4001
Content-Type: application/json
Content-Length: 388

{
   "query":"query {\n  listDirectory(path: \"user1\") {\n    repository {\n      tree {\n        blobs {\n          edges {\n            node {\n              name\n              type\n            }\n          }\n        }\n        trees {\n          edges {\n            node {\n              name\n              type\n            }\n          }\n        }\n      }\n    }\n  }\n}"
}
```

This HTTP POST request will generate the following HTTP response message.

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Connection: close
Content-Length: 306
Content-Type: application/json; charset=utf-8
Date: Tue, 26 Sep 2023 20:26:49 GMT
X-Powered-By: Express

{"data":{"listDirectory":{"repository":{"tree":{"blobs":{"edges":[]},"trees":{"edges":[{"node":{"name":"data","type":"tree"}},{"node":{"name":"digital twins","type":"tree"}},{"node":{"name":"functions","type":"tree"}},{"node":{"name":"models","type":"tree"}},{"node":{"name":"tools","type":"tree"}}]}}}}}}
```

#### Fetch a file

This query receives directory path and send the file contents to user in response.

To check this query, create a file `files/user2/data/welcome.txt`
with content of `hello world`.

```http
POST /lib HTTP/1.1
Host: localhost:4001
Content-Type: application/json
Content-Length: 217

{
   "query":"query {\n  readFile(path: \"user2/data/welcome.txt\") {\n    repository {\n      blobs {\n        nodes {\n          name\n          rawBlob\n          rawTextBlob\n        }\n      }\n    }\n  }\n}"
}
```

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Connection: close
Content-Length: 134
Content-Type: application/json; charset=utf-8
Date: Wed, 27 Sep 2023 09:17:18 GMT
X-Powered-By: Express

{"data":{"readFile":{"repository":{"blobs":{"nodes":[{"name":"welcome.txt","rawBlob":"hello world","rawTextBlob":"hello world"}]}}}}}
```

<!-- markdownlint-enable MD013 -->
</details>

<!--                                      -->
<!--                                      -->
<!--                                      -->
<!--                                      -->
<!-- Below is the documentation for the   -->
<!--       autoSync feature. HOWEVER!     -->
<!--       this was written by ChatGPT,   -->
<!--       with editing and adjustment    -->
<!--       by the Programer.              -->
<!--                                      -->

## 🤖 AutoSync Feature

The **autoSync** feature enables automated synchronization
between the local repository and its remote Git counterpart.
The intent is to help keep changes up to date by
performing periodic sequences of Git operations automatically.

### How It Works

- **Upstream Configuration:**  
  The service attempts to set the upstream branch (e.g., `origin/main`).
  If it cannot determine the current branch, a warning is logged and the upstream configuration is skipped.

- **Pull Latest Changes:**  
  The service automatically pulls the latest changes from the remote repository.

- **Local Change Detection:**  
  It examines the repository's status using `git status --porcelain` to detect any local modifications.

- **Commit and Push:**  
  If modifications are found, the service stages the changes (`git add .`), commits them with an auto-generated message
  (including a timestamp and the chosen automation symbol 🤖 for ease of finding and reading the commits),
  and pushes the changes back to the remote repository.

- **Error Handling and Logging:**  
  Every step is logged for transparency, ensuring that any issues
  (e.g., errors during pull, commit, or push)
  are reported through detailed log messages with the time stamps
  to decern which happened when and where.

### Configuration

The autoSync feature works in Git mode.
Ensure that your YAML configuration file
(e.g., `libms.yaml`) is updated appropriately.
An example configuration fragment for Git mode is:

```yaml
mode: 'git' # <==--
git-repos:
  - user1:
      repo-url: 'https://gitlab.com/dtaas/user1.git'
  - user2:
      repo-url: 'https://gitlab.com/dtaas/user2.git'
  - common:
      repo-url: 'https://gitlab.com/dtaas/common.git'
```

### Usage

- **Manual Synchronization:**  
  Trigger a sync manually by calling the `syncRepository()` method provided by the AutoSync service.

- **Scheduled Synchronization:**  
  To have the synchronization process run at regular intervals, invoke the `scheduleAutoSync(intervalSeconds)` method. For instance, `scheduleAutoSync(60)` will run the sync every 60 seconds.

- **Manually Setting the chosen Repository**
  Call the `setRepository()` API that takes the path for the repo wanted to.

- **Finding out the current Repository**
  Call the `GetCurrentRepository()` API to get the repo path the autoSync is set to.

Each auto-generated commit appears similar to the example below:

```
🤖Auto commit🤖 at 2025-03-24T12:00:00.000Z
```

This integration helps ensure your local repository remains synchronized with the remote source automatically.

## aggregated featurs:

there are no real one way to test each feature indivdiually.
that said, if you run the follwoing:

```powershell
$env:SECRET_KEY = "5fe402f4f0ae2f23d31a88a4e1f17d6ad7ab3c84f56df89d9fc5a90a47c63f2e"
$env:SECRETS_PASSWORD = "mySuperSecretPassword123!"
yarn start -- -H ./config/http.json
```

you should see:

```bash
[Config] Secrets loaded and decrypted
[bootstrap] √ Secrets loaded successfully
```

Below is a short guide that walks through all the “end-to-end” steps—setting environment variables, starting the service, and verifying that each feature is behaving as expected. Feel free to copy/paste or adapt it into a `README.md` or internal wiki page.

---

## Running and Testing the New LibMS Features

This document assumes you have:

- A working Node ≥ 18 / npm or Yarn environment.
- A valid Git repository layout under your `files/` directory (the “working copies” of each user repo).
- Already generated (or placeholder) values for:

  - `SECRET_KEY` (a 64-character hex string)
  - `SECRETS_PASSWORD` (a passphrase used to lock/unlock `secrets.enc`)

The two main “feature blocks” that we want to verify are:

1. **Encrypted-Secrets (“Store Tokens as Secrets”)**
2. **Git-Auto-Sync (“Merge-ours” & periodic pull/commit/push + Incompatible-Config check + SSH support)**

Below are step-by-step instructions for:

1. Setting up your environment variables.
2. Starting the service.
3. Verifying each sub-feature (Secrets, Incompatible-Config, Merge-ours, SSH, periodic sync).

---

### 1. Environment Setup

Before you run anything, open a terminal (PowerShell on Windows or a bash-compatible shell on macOS/Linux) and export two environment variables:

1. **`SECRET_KEY`**

   - Must be exactly 64 hex characters (32 bytes).
   - Used to encrypt/decrypt the on-disk `secrets.enc` file.
   - Example (dummy value):

     ```powershell
     $env:SECRET_KEY = "5fe402f4f0ae2f23d31a88a4e1f17d6ad7ab3c84f56df89d9fc5a90a47c63f2e"
     ```

   - If you see the error

     ```
     Error: SECRET_KEY must be a 64-character hex string (32 bytes)
     ```

     that means your `SECRET_KEY` is missing or invalid.

2. **`SECRETS_PASSWORD`**

   - A “master passphrase” you choose—used to unlock the encrypted file.
   - Can be any string (e.g. `mySuperSecretPassword123!`).
   - Example:

     ```powershell
     $env:SECRETS_PASSWORD = "mySuperSecretPassword123!"
     ```

Once both are set, the process will:

- Check for an existing `secrets.enc` at project root (e.g. `servers/lib/secrets.enc`).
- If missing, create a brand-new (encrypted) file containing any Git tokens you add.
- If present, decrypt it using the above env vars.

---

### 2. Starting the Service

Assuming you’re in the project’s root directory (`…/DTaaS/servers/lib`), run:

```bash
yarn start -- -H ./config/http.json
```

or, if you prefer npm:

```bash
npm run start -- -H ./config/http.json
```

You should see output similar to this:

```text
[Nest] …  - … LOG [NestFactory] Starting Nest application…
  MSG   - … [Config] Secrets loaded and decrypted
  MSG   - … [bootstrap] √ Secrets loaded successfully
  MSG   - … [Config] Config loaded
  MSG   - … [Config] Object:
    { "port": "4001", "mode": "git", "local-path": "...", … }
  MSG   - … [bootstrap] √ Config file parsed successfully
  MSG   - … [bootstrap] Starting libms in git mode, serving files from … on port 4001
  MSG   - … [GitFilesService] ✓ Repo for "user1" matches config
  MSG   - … “Repo already exists at …\files\user1; skipping clone.”
  MSG   - … “Scheduled auto-sync for user1 every 15 seconds.”
  MSG   - … (same for user2, common, etc.)
  MSG   - … “--- Starting periodic sync cycle ---”
  MSG   - … “╸calling pull…”
  MSG   - … “Pulling latest changes…”
  MSG   - … “On branch: main”
  MSG   - … “Fetching…”
  MSG   - … “Merge (ours) completed on "main".”
  MSG   - … “Pull (fetch+merge) succeeded.”
  MSG   - … “╸calling checkOrCommit…”
  MSG   - … “No changes detected; nothing to commit.”
  MSG   - … “╸calling push…”
  MSG   - … “No HTTP token provided; skipping push for public repo.”
  MSG   - … “--- Periodic sync cycle completed ---”
```

**If you see exactly that sequence, it means:**

- Your `SECRET_KEY` and `SECRETS_PASSWORD` worked to decrypt (or create) `secrets.enc`.
- `bootstrap.ts` loaded the “libms.yaml” config successfully.
- Each Git repo in `files/<userKey>` matched the URL in `libms.yaml`.
- The “ours” merge strategy was used on `git pull`.
- No local changes → no commit.
- For public repos, push is skipped (because no token was set in secrets).
- The cycle repeats on the configured sync interval.

---

### 3. Verifying Encrypted-Secrets

1. **First Run (no `secrets.enc` present)**

   - You will see:

     ```
     [Config] Secrets loaded and decrypted
     [bootstrap] √ Secrets loaded successfully
     [Config] Secrets encrypted and saved
     [bootstrap] Set and saved new githubToken secret
     ```

   - A file named `secrets.enc` will appear in your project root (e.g. `servers/lib/secrets.enc`).

2. **Inspect `secrets.enc`**

   - Open it with a hex editor or run `xxd secrets.enc` (Linux/macOS).
   - You should **not** see `"my-new-token"` in plaintext—only gibberish binary.

3. **Second Run (with `secrets.enc` present, same ENV vars)**

   - Stop the server (`Ctrl+C`).
   - Re-run `yarn start …` (ensuring `SECRET_KEY` + `SECRETS_PASSWORD` are set).
   - You will see no “Set and saved new githubToken” message on stage 6—because `githubToken` was already populated in the previously written `secrets.enc`.
   - Instead, you’ll see only:

     ```
     [Config] Secrets loaded and decrypted
     [bootstrap] √ Secrets loaded successfully
     ```

   - That proves `loadSecrets()` read back the same encrypted data.

4. **Modify `githubToken` to test “save”**

   - Manually open the decrypted JSON (in code or by adding a temporary `console.log(configService.getSecret('githubToken'))`).
   - Change it to something else (e.g. `configService.setSecret('githubToken', 'anotherValue')`) and call `saveSecrets()` again.
   - Restart and verify `getSecret('githubToken')` reflects the new value.

---

### 4. Verifying Incompatible-Config

> This feature ensures that if a user’s folder under `files/<userKey>` was originally cloned from a different remote URL than what’s in `libms.yaml`, the service will throw an error and exit.

1. **Original (matching) config**

   - If `files/user1/.git/config → [remote "origin"].url` equals `repo-url: "https://gitlab.com/dtaas/user1.git"` in `libms.yaml`, you will see:

     ```
     [GitFilesService] ✓ Repo for "user1" matches config
     ```

2. **Test a mismatch**

   - Navigate to one of your existing clones, e.g. `cd files/user2`.
   - Run:

     ```bash
     git remote set-url origin https://github.com/someone-else/other-repo.git
     ```

   - Then restart the service (`yarn start …`).
   - You should see an error like:

     ```
     [GitFilesService] X Incompatible Git repo detected for userKey "user2"
       Config repo-url: https://gitlab.com/dtaas/user2.git
       Actual origin:   https://github.com/someone-else/other-repo.git
     Error: Git repository mismatch – aborting.
     ```

   - The process will exit (because we threw an exception). This prevents you from continuing until the folder’s origin matches the YAML.

3. **Restore the correct origin**

   - In `files/user2/`, run:

     ```bash
     git remote set-url origin https://gitlab.com/dtaas/user2.git
     ```

   - Now restarting the service should succeed again.

---

### 5. Verifying “Merge-Ours” Conflict Resolution

When you run `git pull` via Isomorphic-Git’s `fetch + merge` calls, the code chooses “ours” (keep the local version) automatically on conflict. To test:

1. In one of your repo folders (e.g. `files/user2`), create or modify a file on the `main` branch:

   ```bash
   cd files/user2
   echo "Local change" >> conflict.txt
   git add conflict.txt
   git commit -m "Local change – test conflict"
   ```

2. Meanwhile, push an unrelated change upstream (e.g. via the GitLab web UI). For example, edit the same `conflict.txt` on GitLab so that it conflicts with your local change.
3. Wait for the next sync tick (10 seconds). The logs should show:

   ```
   ── Starting periodic sync cycle ──
   ╸calling pull…
   Pulling latest changes…
   On branch: main
   Fetching…
   Merge (ours) completed on "main".
   Pull (fetch+merge) succeeded.
   ╸calling checkOrCommit…
   ✏️ Changes to commit: conflict.txt
   • git.add conflict.txt
   • git.commit — message: "Auto commit at 2025-06-02T…"
   ✔ Committed 1 file(s).
   ╸calling push…
   Push succeeded.
   ── Periodic sync cycle completed ──
   ```

   Even though a true “merge conflict” existed, the “ours” strategy kept your local version of `conflict.txt` and created a merge commit. (You can confirm in `files/user2/conflict.txt` that your local content was preserved.)

---
