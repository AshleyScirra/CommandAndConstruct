 
 // The GameServer class represents the state of the game and runs the main game logic.
 // It runs in a Web Worker and communicates with clients by messaging - either local messages
 // for the local player or remote players over the network.
 export class GameServer {
 	constructor()
	{
		console.log("Creating GameServer class");
	}
	
	Release()
	{
		console.log("Releasing GameServer class");
	}
 }