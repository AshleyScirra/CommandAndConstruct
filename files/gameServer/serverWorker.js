
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

// Called when a message is received from the runtime, possibly with latency simulation.
async function OnMessageFromRuntime(e)
{
	// Look up the function to call for this message type in the message map.
	const data = e.data;
	const transmissionMode = data["transmissionMode"];
	
	// Handle the init message separately, as it is responsible for creating GameServer.
	if (data["type"] === "init")
	{
		OnInit(data);
	}
	else
	{
		const isReceived = await WaitForSimulatedLatency(transmissionMode, "receive");

		// If isReceived is false then the packet is simulated as dropped, so skip handling.
		// Also ignore if GameServer was released.
		if (!isReceived || !gameServer)
			return;

		gameServer.GetMessageHandler().HandleMessage(data);
	}
}

// Called when the runtime wants to initialise the GameServer.
function OnInit(data)
{
	// Initialise GameServer, passing it the function that can send a message to the runtime
	// and the Construct object data collected from the runtime.
	gameServer = new GameServer(SendMessageToRuntime, data["constructObjectData"]);
}

// Post a message to the runtime, possibly with latency simulation.
async function SendMessageToRuntime(message, transmissionMode, forPlayer, transferList)
{
	const isSent = await WaitForSimulatedLatency(transmissionMode, "send");
	
	// If isSent is false then the packet is simulated as dropped, so skip sending.
	if (!isSent)
		return;
	
	messagePort.postMessage({
		"message": message,
		"transmissionMode": transmissionMode,
		"forPlayer": forPlayer		// null to broadcast, else player number to send to
	}, transferList);
}

