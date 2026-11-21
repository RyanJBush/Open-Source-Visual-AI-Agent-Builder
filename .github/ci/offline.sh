#!/usr/bin/env bash
# GitHub-hosted Ubuntu bootstrap has already installed the pinned Node runtime.
set -euo pipefail
node_bin=$(dirname "$(command -v node)")
runner_uid=$(id -u)
runner_gid=$(id -g)
host_net=$(readlink /proc/self/ns/net)
offline_home=$(mktemp -d "${RUNNER_TEMP:?}/relay-offline.XXXXXXXX")

# Drop root and supplementary groups before running any project command.
# The new network namespace starts without host interfaces or external routes.
sudo -n /usr/bin/unshare --net -- /usr/bin/setpriv \
  --reuid="$runner_uid" --regid="$runner_gid" --clear-groups \
  --bounding-set=-all --no-new-privs \
  /usr/bin/env -i HOME="$offline_home" PATH="$node_bin:/usr/bin:/bin" \
  CI=true npm_config_offline=true npm_config_update_notifier=false \
  /bin/bash -euo pipefail -c '
    test "$(readlink /proc/self/ns/net)" != "$1"
    test "$(id -u)" != 0
    node --input-type=module -e "import {networkInterfaces} from \"node:os\";
      if (Object.values(networkInterfaces()).flat().some(n => !n.internal))
        throw Error(\"Offline CI has a non-loopback network interface\");"
    npm test
    node cli.mjs examples/support.json
  ' relay-offline "$host_net"
