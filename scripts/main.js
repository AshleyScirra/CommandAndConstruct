
import { GameClient } from "./gameClient/gameClient.js";

// The created GameClient class to represent the game client state.
let gameClient = null;

// Called on startup as game starts to load
runOnStartup(async runtime =>
{
	// Listen for event that fires just before the project starts
	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime)
{
	// Once the project has finished loading, start up the game server web worker.
	const messagePort = await runtime.createWorker("gameServer/serverWorker.js", {
		name: "GameServer",
		type: "module"
	});
	
	// Listen for messages received from the worker.
	messagePort.onmessage = HandleGameServerMessage;
	
	// Post an init message to the worker to tell it to initialize.
	messagePort.postMessage({
		"type": "init"
	});
	
	// Create the GameClient when the Game layout starts, and destroy it when the layout ends.
	const gameLayout = runtime.getLayout("Game");
	gameLayout.addEventListener("beforelayoutstart", () =>
	{
		gameClient = new GameClient(runtime);
	});
	
	gameLayout.addEventListener("beforelayoutend", () =>
	{
		gameClient.Release();
		gameClient = null;
	});
}

function HandleGameServerMessage(e)
{
	const data = e.data;
	
	console.log(`[Runtime] Message from GameServer: `, data);
}