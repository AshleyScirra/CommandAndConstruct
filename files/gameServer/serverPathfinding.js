
// Class to manage pathfinding on the server.
// The server actually uses the Pathfinding behavior of the host player.
// Therefore this class mainly handles messaging the host player.
export class ServerPathfinding {

	#gameServer;
	
	constructor(gameServer)
	{
		this.#gameServer = gameServer;
	}
	
	FindPath(fromX, fromY, toX, toY)
	{
		// Use SendToRuntimeAsync() to get the host player to calculate the
		// path on behalf of the server. This returns a promise that resolves
		// with a list of waypoints (or null if pathfinding failed).
		return this.#gameServer.GetMessageHandler().SendToRuntimeAsync({
			"type": "find-path",
			"from": [fromX, fromY],
			"to": [toX, toY]
		}, "", 0);
	}
}