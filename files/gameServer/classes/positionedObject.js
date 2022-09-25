
// A PositionedObject has an X and Y co-ordinate.
export class PositionedObject {

	// Private fields
	#gameServer;			// reference to GameServer
	#x = 0;					// X position
	#y = 0;					// Y position
	
	constructor(gameServer, x = 0, y = 0)
	{
		this.#gameServer = gameServer;
		
		this.#x = x;
		this.#y = y;
	}
	
	GetGameServer()
	{
		return this.#gameServer;
	}
	
	GetPosition()
	{
		return [this.#x, this.#y];
	}
}