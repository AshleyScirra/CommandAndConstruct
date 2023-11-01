import { GameServer } from "./gameServer.js";
// Pathfinding settings
// GROUP_MAX_WORKERS sets how many workers are allowed to calculate pathfinding
// jobs in parallel in a pathfinding group. If this is too high then many paths
// can take the same route before they start to get spread out, but if it is too
// low then it might not take full advantage of available CPU cores.
const GROUP_MAX_WORKERS = 4;
// GROUP_BASE_COST sets the base cell cost to add along paths that are calculated
// in a group. The higher this is then the more subsequent paths in the same group
// will be discouraged from taking the same route.
const GROUP_BASE_COST = 1;
// GROUP_CELL_SPREAD is how many cells to spread out around the path that is
// calculated. It works best with an odd number as that ensures the cost area
// is symmetrical around the path that was calculated.
const GROUP_CELL_SPREAD = 3;
// Class to manage pathfinding on the server.
// The server actually uses the Pathfinding behavior of the host player.
// Therefore this class mainly handles messaging the host player.
export class ServerPathfinding {
    #gameServer;
    constructor(gameServer) {
        this.#gameServer = gameServer;
    }
    FindPath(fromX, fromY, toX, toY) {
        // Use SendToRuntimeAsync() to get the host player to calculate the
        // path on behalf of the server. This returns a promise that resolves
        // with a list of waypoints (or null if pathfinding failed).
        return this.#gameServer.GetMessageHandler().SendToRuntimeAsync({
            "type": "find-path",
            "from": [fromX, fromY],
            "to": [toX, toY]
        }, "", 0);
    }
    // The threshold is the minimum number of units moved simultaneously that
    // will use a pathfinding group. This is set to the number of workers, since
    // there must be more than 1 unit per worker for path spreading to be effective.
    GetGroupThreshold() {
        return GROUP_MAX_WORKERS;
    }
    // Methods to start and end a path group. These send messages to the
    // host player to make the corresponding calls to the Pathfinding behavior.
    StartGroup() {
        this.#gameServer.GetMessageHandler().SendToRuntime({
            "type": "pathfinding-start-group",
            "baseCost": GROUP_BASE_COST,
            "cellSpread": GROUP_CELL_SPREAD,
            "maxWorkers": GROUP_MAX_WORKERS
        }, "", 0);
    }
    EndGroup() {
        this.#gameServer.GetMessageHandler().SendToRuntime({
            "type": "pathfinding-end-group"
        }, "", 0);
    }
}
