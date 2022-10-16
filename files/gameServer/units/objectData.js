
// The ObjectData class stores data about the game, such as the size of units, for GameServer.
// It's passed from the runtime as that has access to the object details. This class is the
// GameServer counterpart to the data collected in GameClientMessageHandler.#GetConstructObjectDataFor().
export class ObjectData {

	#gameServer;
	#name = "";
	#width = 0;
	#height = 0;
	#originX = 0;
	#originY = 0;
	#imagePointX = 0;
	#imagePointY = 0;
	#collisionPoly = [];
	
	constructor(gameServer, entry)
	{
		this.#gameServer = gameServer;
		
		this.#name = entry["name"];
		this.#width = entry["width"];
		this.#height = entry["height"];
		this.#originX = entry["origin"][0];
		this.#originY = entry["origin"][1];
		this.#imagePointX = entry["imagePoint"][0];
		this.#imagePointY = entry["imagePoint"][1];
		this.#collisionPoly = entry["collisionPoly"];
	}
	
	GetSize()
	{
		return [this.#width, this.#height];
	}
	
	GetOrigin()
	{
		return [this.#originX, this.#originY];
	}
	
	GetImagePoint()
	{
		return [this.#imagePointX, this.#imagePointY];
	}
}