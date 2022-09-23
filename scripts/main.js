
// Called on startup as game starts to load
runOnStartup(async runtime =>
{
	// Listen for event that fires just before the project starts
	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime)
{
	// Once the project has finished loading, start up the game server web worker.
	const messagePort = await runtime.createWorker("gameServer/gameServer.js", {
		name: "GameServer",
		type: "module"
	});
	
	// Listen for messages received from the worker.
	messagePort.onmessage = HandleGameServerMessage;
	
	// Post an init message to the worker to tell it to initialize.
	messagePort.postMessage({
		"type": "init"
	});
}

function HandleGameServerMessage(e)
{
	const data = e.data;
	
	console.log(`[Runtime] Message from GameServer: `, data);
}