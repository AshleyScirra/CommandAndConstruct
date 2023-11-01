
import { GameServer } from "../gameServer.js";

// A PositionedObject has an X and Y co-ordinate.
export class PositionedObject {

	// Private fields
	#gameServer;			// reference to GameServer
	#x = 0;					// X position
	#y = 0;					// Y position
	
	constructor(gameServer: GameServer, x = 0, y = 0)
	{
		this.#gameServer = gameServer;
		
		this.#x = x;
		this.#y = y;
	}
	
	GetGameServer()
	{
		return this.#gameServer;
	}
	
	SetPosition(x: number, y: number)
	{
		this.#x = x;
		this.#y = y;
	}
	
	GetPosition()
	{
		return [this.#x, this.#y];
	}
}