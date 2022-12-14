
// Web Worker script to run the game server in a separate thread.
import { WaitForSimulatedLatency } from "./utils/latencySimulation.js";
import { GameServer } from "./gameServer.js";

let messagePort = null;		// for communicating with runtime
let gameServer = null;		// main GameServer class

// Construct's createWorker() API will send this worker a "construct-worker-init"
// message with the message port to directly communicate with the runtime.
self.addEventListener("message", e =>
{
	if (e.data && e.data["type"] === "construct-worker-init")
	{
		messagePort = e.data["port2"];
		messagePort.onmessage = OnMessageFromRuntime;
	}
});

// Map of message types that can be received from the client
// and the function to call to handle them.
const MESSAGE_MAP = new Map([
	["init", OnInit],
	["release", OnRelease],
	["move-units", OnMoveUnits]
]);

// Called when a message is received from the runtime, possibly with latency simulation.
async function OnMessageFromRuntime(e)
{
	// Look up the function to call for this message type in the message map.
	const data = e.data;
	const messageType = data["type"];
	const transmissionMode = data["transmissionMode"];
	const handlerFunc = MESSAGE_MAP.get(messageType);
	
	if (handlerFunc)
	{
		const isReceived = await WaitForSimulatedLatency(transmissionMode, "receive");
	
		// If isReceived is false then the packet is simulated as dropped, so skip handling.
		if (!isReceived)
			return;
			
		// Call the message handler function with the provided data.
		handlerFunc(data);
	}
	else
	{
		// Messages should always have a handler, so log an error if it's not found.
		console.error(`[GameServer] No message handler for type '${messageType}'`);
	}
}

// Called when the runtime wants to initialise the GameServer.
function OnInit(e)
{
	// Initialise GameServer, passing it the function that can send a message to the runtime
	// and the Construct object data collected from the runtime.
	gameServer = new GameServer(SendMessageToRuntime, e["constructObjectData"]);
}

// Called when the runtime is ending the game.
function OnRelease(e)
{
	// Only player 0 - the single player or multiplayer host - can terminate GameServer.
	if (e["player"] !== 0)
		return;
	
	// Just terminate this entire worker. We could write code that releases everything in
	// GameServer, but there isn't really any point if the whole worker is terminated anyway.
	self.close();
}

// Post a message to the runtime, possibly with latency simulation.
async function SendMessageToRuntime(message, transmissionMode, transferList)
{
	const isSent = await WaitForSimulatedLatency(transmissionMode, "send");
	
	// If isSent is false then the packet is simulated as dropped, so skip sending.
	if (!isSent)
		return;
	
	messagePort.postMessage({
		"message": message,
		"transmissionMode": transmissionMode
	}, transferList);
}

function OnMoveUnits(data)
{
	const player = data["player"];
	const units = data["units"];
	
	gameServer.MoveUnits(player, units);
}
