
import { GameClient } from "./gameClient/gameClient.js";

// The created GameClient class to represent the game client state.
let gameClient = null;

// The message port for communicating with the game server.
let messagePort = null;

// Called on startup as game starts to load
runOnStartup(async runtime =>
{
	// Listen for event that fires just before the project starts
	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime)
{
	// Create and release classes when the game layout starts and ends.
	const gameLayout = runtime.getLayout("Game");
	gameLayout.addEventListener("beforelayoutstart", () => OnStartGameLayout(runtime));
	gameLayout.addEventListener("beforelayoutend", () => OnEndGameLayout());
}

// Create classes when starting the game layout.
async function OnStartGameLayout(runtime)
{
	// Start up the game server web worker.
	messagePort = await runtime.createWorker("gameServer/serverWorker.js", {
		name: "GameServer",
		type: "module"
	});

	// Listen for messages received from the worker.
	messagePort.onmessage = HandleGameServerMessage;

	// Post an init message to the worker to tell it to initialize.
	SendMessageToGameServer({
		"type": "init"
	});
	
	// Create the game client which manages the other end of the game state.
	// Also pass it the SendMessageToGameServer function for messaging.
	gameClient = new GameClient(runtime, SendMessageToGameServer);
}

// Release classes when ending the game layout.
function OnEndGameLayout()
{
	gameClient.Release();
	gameClient = null;
	
	SendMessageToGameServer({
		"type": "release"
	});
}

// Helper function for posting a message.
function SendMessageToGameServer(msg)
{
	messagePort.postMessage(msg);
}

// Map of message types that can be received from GameServer
// and the function to call to handle each of them.
const MESSAGE_MAP = new Map([
	["create-initial-state", OnCreateInitialState]
]);

// Called when a message is received from the game server.
function HandleGameServerMessage(e)
{
	// Look up the function to call for this message type in the message map.
	const data = e.data;
	const messageType = data["type"];
	const handlerFunc = MESSAGE_MAP.get(messageType);
	
	if (handlerFunc)
	{
		// Call the message handler function with the provided data.
		handlerFunc(data);
	}
	else
	{
		// Messages should always have a handler, so log an error if it's not found.
		console.error(`[GameServer] No message handler for type '${messageType}'`);
	}
}

function OnCreateInitialState(data)
{
	gameClient.CreateInitialState(data);
}