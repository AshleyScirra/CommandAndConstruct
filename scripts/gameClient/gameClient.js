
import { ClientUnit } from "../clientUnits/clientUnit.js";
import { GameClientMessageHandler } from "./messageHandler.js";
import { SelectionManager } from "./selectionManager.js";

const MAGIC_NUMBER = 0x63266321;		// "c&c!" in ASCII

// The GameClient class is created while on a game layout, and handles representing the
// state of the game for the runtime. Note that the authoritative state of the game lives
// on GameServer, so the GameClient is mostly responsible for updating the state of the
// game to match the server state, and sending player inputs to the server.
export class GameClient {

	// Private fields
	#runtime;						// Construct runtime
	#sendMessageFunc;				// SendMessageToGameServer function
	#allUnitsById = new Map();		// map of all units by id -> Unit
	
	#messageHandler;				// MessageHandler class
	#selectionManager;				// SelectionManager class
	
	#player = 0;					// Player number this client controls
	
	constructor(runtime, sendMessageFunc, player)
	{
		this.#runtime = runtime;
		this.#sendMessageFunc = sendMessageFunc;
		this.#player = player;
		
		// Create GameClientMessageHandler which handles messages from GameServer
		// and calls the appropriate methods on this class.
		this.#messageHandler = new GameClientMessageHandler(this);
		
		// Create SelectionManager which handles unit selections.
		this.#selectionManager = new SelectionManager(this);
	}
	
	Release()
	{
		this.#selectionManager.Release();
	}
	
	GetRuntime()
	{
		return this.#runtime;
	}
	
	GetPlayer()
	{
		return this.#player;
	}
	
	// Provide a GameClient method to send a message to GameServer.
	SendToServer(msg)
	{
		this.#sendMessageFunc(msg);
	}
	
	HandleGameServerMessage(msg)
	{
		this.#messageHandler.HandleGameServerMessage(msg);
	}
	
	// Called when GameServer sends the initial state of the game.
	// The client needs to create objects to represent the server state.
	CreateInitialState(data)
	{
		for (const unitData of data["units"])
		{
			// Create a ClientUnit from each unit data.
			const clientUnit = ClientUnit.CreateFromInitialData(this, unitData);
			this.#allUnitsById.set(clientUnit.GetId(), clientUnit);
		}
	}
	
	GetSelectionManager()
	{
		return this.#selectionManager;
	}
	
	// Iterates all units in the game.
	allUnits()
	{
		return this.#allUnitsById.values();
	}
	
	// Iterates all units that belong to the local player.
	*allLocalPlayerUnits()
	{
		for (const unit of this.allUnits())
		{
			if (unit.GetPlayer() === this.GetPlayer())
				yield unit;
		}
	}
	
	GetUnitById(id)
	{
		return this.#allUnitsById.get(id);
	}
	
	// Called when the player commands some selected units to move to a position.
	MoveUnits(unitsArray, x, y)
	{
		// TODO: send a message to GameServer to handle the instruction.
		this.SendToServer({
			"type": "move-units",
			"unitIds": unitsArray.map(u => u.GetId()),
			"position": [x, y]
		});
	}
	
	// Called when received a new game state update from GameServer.
	OnStateUpdate(arrayBuffer)
	{
		// Catch and log any exceptions that happen while reading data from the server.
		try {
			const dataView = new DataView(arrayBuffer);
			let pos = 0;		// read position in bytes

			// Read the magic number.
			const magicNumber = dataView.getUint32(pos);
			pos += 4;

			// Verify the magic number. Ignore any messages with the wrong magic number.
			// This should make sure this code doesn't attempt to read an update from
			// a fragmented or corrupt message.
			if (magicNumber !== MAGIC_NUMBER)
			{
				console.error(`Ignored state update with incorrect magic number 0x${magicNumber.toString(16)}`);
				return;
			}

			// Read the total number of units in this update.
			const unitCount = dataView.getUint32(pos);
			pos += 4;

			// For each unit in the data, read the unit's data.
			for (let i = 0; i < unitCount; ++i)
			{
				// Read unit ID.
				// NOTE: if the unit ID is not found, read the rest of the values
				// anyway, since the read position still has to be advanced.
				const unitId = dataView.getUint32(pos);
				pos += 4;
				
				// Read the X and Y position as floats.
				const x = dataView.getFloat32(pos);
				pos += 4;
				const y = dataView.getFloat32(pos);
				pos += 4;
				
				// Read the angle
				const angle = dataView.getFloat32(pos);
				pos += 4;
				
				// Now all the data has been read, look up the unit by its ID,
				// and if found update it with these details.
				const unit = this.GetUnitById(unitId);
				if (unit)
					unit.UpdateState(x, y, angle);
			}
		}
		catch (err)
		{
			console.error("Error reading state update: ", err);
		}
	}
}
