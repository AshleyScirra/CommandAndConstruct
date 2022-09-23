
// Web Worker script to run the game server in a separate thread.
let messagePort = null;		// for communicating with runtime

// Construct's createWorker() API will send this worker a "construct-worker-init"
// message with the message port to directly communicate with the runtime.
self.addEventListener("message", e =>
{
	if (e.data && e.data["type"] === "construct-worker-init")
	{
		messagePort = e.data["port2"];
		messagePort.onmessage = OnMessageFromRuntime;
		OnReady();
	}
});

// Called when a message is received from the runtime.
function OnMessageFromRuntime(e)
{
	const data = e.data;
	
	console.log("[GameServer] Received message from port: ", data);
}

function OnReady()
{
	// Post a test message back to the runtime so we can see communication working
	messagePort.postMessage({
		"type": "test",
		"message": "Hello world!"
	});
}