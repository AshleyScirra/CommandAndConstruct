
import Globals from "../globals.js";

// "Magic number" that binary messages start with to verify it's an expected message.
// This avoids things like fragmented packets trying to be read as a whole packet.
const MAGIC_NUMBER = 0x63266321;		// "c&c!" in ASCII

// This class handles receiving messages from the GameServer (whether it's hosted locally or receiving
// messages over the network). It calls the appropriate GameClient methods for each message.
// This keeps all the message handling logic in its own class rather than cluttering GameClient.
export class GameClientMessageHandler {

	// Private fields
	#gameClient;				// reference to GameClient
	#messageMap;				// Map of message type -> handler function
	
	#lastMessageSequenceNumber = -1;
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", m => this.#OnCreateInitialState(m)]
		]);
	}
	
	HandleGameServerMessage(msg)
	{
		// The host sends game state updates as binary ArrayBuffers.
		// If the message is an ArrayBuffer, treat it as a state update.
		if (msg instanceof ArrayBuffer)
		{
			this.#OnStateUpdate(msg);
		}
		else		// otherwise treat as JSON message
		{
			// Look up the function to call for this message type in the message map.
			const messageType = msg["type"];
			const handlerFunc = this.#messageMap.get(messageType);

			if (handlerFunc)
			{
				// Call the message handler function with the provided message.
				handlerFunc(msg);
			}
			else
			{
				// Messages should always have a handler, so log an error if it's not found.
				console.error(`No message handler for message from GameServer type '${messageType}'`);
			}
		}
	}
	
	#OnCreateInitialState(msg)
	{
		this.#gameClient.CreateInitialState(msg);
	}
	
	// Called when received a new binary game state update from GameServer.
	#OnStateUpdate(arrayBuffer)
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
			
			// Read the sequence number. This is incremented with every message sent out,
			// but these binary updates are transmitted in unreliable mode, meaning some
			// messages could arrive late and come after a newer message. Ignoring messages
			// with a lower sequence number than the last one received avoids using an older
			// state update than the last one received.
			const sequenceNumber = dataView.getUint32(pos);
			pos += 4;
			
			if (sequenceNumber <= this.#lastMessageSequenceNumber)
				return;		// ignore this message
			else
				this.#lastMessageSequenceNumber = sequenceNumber;

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
				
				// Read the platform angle
				const platformAngle = dataView.getFloat32(pos);
				pos += 4;
				
				// Read the turret offset angle
				const turretOffsetAngle = dataView.getFloat32(pos);
				pos += 4;
				
				// Now all the data has been read, look up the unit by its ID,
				// and if found update it with these details.
				const unit = this.#gameClient.GetUnitById(unitId);
				if (unit)
				{
					unit.UpdateState(x, y, platformAngle, turretOffsetAngle);
				}
			}
		}
		catch (err)
		{
			console.error("Error reading state update: ", err);
		}
	}
	
	// Get information about units, such as their size and image point locations,
	// to send to GameServer.
	GetConstructObjectData()
	{
		// For each entry in the list of all unit object types, get the data
		// for that object type and return all the data in an array.
		return this.#gameClient.GetAllUnitObjectTypes().map(
			objectType => this.#GetConstructObjectDataFor(objectType)
		);
	}
	
	// Get object data for a single Construct object type.
	#GetConstructObjectDataFor(objectType)
	{
		const inst = objectType.getFirstInstance();
		
		// Make sure there is an instance in the layout to get data from.
		if (!inst)
			throw new Error(`need an instance of '${objectType.name}' in the layout`);
		
		// Get instance position in layout co-ordinates
		const x = inst.x;
		const y = inst.y;
		
		// Get the object origin from the first animation frame.
		// Note this is normalized to a [0, 1] range; everything else is in pixels
		// so also get the origin in pixels.
		const firstFrame = inst.animation.getFrames()[0];
		const originX = firstFrame.originX * inst.width;
		const originY = firstFrame.originY * inst.height;
		
		// Get the first image point position, which returns a position in layout co-ordinates.
		// The instance position is then subtracted to make this relative to the object origin.
		const [imgPtX, imgPtY] = inst.getImagePoint(1);
		
		// Get the collision poly points, which also are returned in layout co-ordinates
		// and so made relative to the object origin.
		const collisionPoly = [];
		for (let i = 0, len = inst.getPolyPointCount(); i < len; ++i)
		{
			const [px, py] = inst.getPolyPoint(i);
			collisionPoly.push([px - x, py - y]);
		}
		
		// Return all details as a JSON object.
		return {
			"name": objectType.name,
			"width": inst.width,
			"height": inst.height,
			"origin": [originX, originY],
			"imagePoint": [imgPtX - x, imgPtY - y],
			"collisionPoly": collisionPoly
		};
	}
}