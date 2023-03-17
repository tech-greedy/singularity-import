# singularity import

Automatically import deals to boost for Filecoin storage provider

![build workflow](https://github.com/tech-greedy/singularity-import/actions/workflows/node.js.yml/badge.svg)
[![npm version](https://badge.fury.io/js/@techgreedy%2Fsingularity-import.svg)](https://badge.fury.io/js/@techgreedy%2Fsingularity-import)

## Prerequisite

```shell
# Install nvm (https://github.com/nvm-sh/nvm#install--update-script)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.bashrc
# Install node v18
nvm install 18
```

## Install globally from npm

```shell
npm i -g @techgreedy/singularity-import
```

## Usage

```shell
$ singularity-import-boost -h
Usage: singularity-import-boost [options]

A tool to automatically import deals to boost

Options:
  -c, --client <addresses...>                List of client addresses to filter the deal proposals
  -p, --path <paths...>                      List of paths to find the CAR files
  -s, --since <duration>                     Import deals that are proposed since this many seconds old and skip those that are older (default: "1d")
  -sd, --sealing-duration <duration>         Import deals whose start time is more than this many seconds in the future to account for time spent for sealing. Otherwise, sealing will fail if it does not finish before the start time of the deal (default: "6h")
  -u, --url-template <template>              The URL template to download CAR files, if it cannot be found from the specified paths. i.e. https://www.download.org/{dataCid}.car, https://www.download.org/{pieceCid}.car
  -dt, --download-threads <threads>          The number of concurrent threads for downloading (default: 8)
  -dr, --download-retries <retries>          The number of exponential retries for each download (default: 3)
  -o, --download-folder <folder>             The folder to save the downloaded CAR files
  -i, --interval <duration>                  The interval in seconds between handling applicable deals, including both file downloads and deal importing. The timer starts when the previous import begins so it is possible to have concurrent imports or downloads if the interval is too small, which is probably
                                             fine with boost. (default: "1m")
  -dc, --download-concurrency <concurrency>  This sets an upper limit of concurrent downloads (default: 1)
  -pc1, --max-pc1 <max_pc1>                  [Not implemented] The maximum number of PC1s to run concurrently, once reached, stop importing or downloading new deals. 0 for unlimited. (default: 0)
  -d, --dry-run                              Do not import deals, just print the deals that would be imported or downloaded (default: false)
  -l, --loop                                 Keep monitoring the incoming deals and perform the import indefinitely (default: false)
  -h, --help                                 display help for command


Environment Variables:
  Make sure you have one of the following environment variables set:
    - MARKETS_API_INFO, i.e. eyJxxx:/ip4/127.0.0.1/tcp/1289/http"
    - BOOST_GRAPHQL_ENDPOINT, i.e. http://127.0.0.1:8080

Example Usage:
  - Import all deals continuously one after another:
    $ singularity-import -p /path/to/car -i 0 -l
  - Import one deal every 20 minutes with multiple paths
    $ singularity-import -p /path1/to/car -p /path2/to/car -i 20m -l
  - Import deals from a specific client and the file can be downloaded from their HTTP server. 
    $ singularity-import -c f1xxxx -u https://www.download.org/{pieceCid}.car -o ./downloads -i 0 -l

```
