
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
	messagePort.postMessage({
		"type": "init"
	});
	
	// Create the game client which manages the other end of the game state.
	gameClient = new GameClient(runtime);
}

// Release classes when ending the game layout.
function OnEndGameLayout()
{
	gameClient.Release();
	gameClient = null;
	
	messagePort.postMessage({
		"type": "release"
	});
}

function HandleGameServerMessage(e)
{
	const data = e.data;
	
	console.log(`[Runtime] Message from GameServer: `, data);
}