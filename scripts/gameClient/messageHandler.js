
import Globals from "../globals.js";
import * as MathUtils from "../utils/clientMathUtils.js";

// "Magic number" that binary messages start with to verify it's an expected message.
// This avoids things like fragmented packets trying to be read as a whole packet.
const MAGIC_NUMBER = 0x63266321;	// "c&c!" in ASCII

// The binary message types
const MESSAGE_TYPE_UPDATE = 0;		// game state update
const MESSAGE_TYPE_EVENTS = 1;		// list of events that have happened

// This class handles receiving messages from the GameServer (whether it's hosted locally or receiving
// messages over the network). It calls the appropriate GameClient methods for each message.
// This keeps all the message handling logic in its own class rather than cluttering GameClient.
export class GameClientMessageHandler {

	// Private fields
	#gameClient;					// reference to GameClient
	#messageMap;					// Map of message type -> handler function
	
	#lastMessageSequenceNumber = -1;
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", m => this.#OnCreateInitialState(m)],
			["game-over", m => this.#OnGameOver(m)],
			["stats", m => this.#OnStats(m)]
		]);
	}
	
	HandleGameServerMessage(msg)
	{
		// The host sends game state updates and events as binary ArrayBuffers.
		// If the message is an ArrayBuffer, treat it as a binary update.
		if (msg instanceof ArrayBuffer)
		{
			this.#OnBinaryMessage(msg);
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
	#OnBinaryMessage(arrayBuffer)
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
				console.error(`Ignored binary message with incorrect magic number 0x${magicNumber.toString(16)}`);
				return;
			}
			
			// Read the message type as a byte.
			const messageType = dataView.getUint8(pos);
			pos += 1;
			
			// Read the message with a different method depending on the message type.
			if (messageType === MESSAGE_TYPE_UPDATE)
				this.#OnStateUpdate(dataView, pos);
			else if (messageType === MESSAGE_TYPE_EVENTS)
				this.#OnNetworkEvents(dataView, pos);
			else
				throw new Error(`unexpected message type '${messageType}'`);
		}
		catch (err)
		{
			console.error("Error reading binary message: ", err);
		}
	}
	
	
	#OnStateUpdate(dataView, pos)
	{
		// Read the game time. TODO: use this to help smooth game state.
		const gameTime = dataView.getFloat32(pos);
		pos += 4;
		
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
		const unitCount = dataView.getUint16(pos);
		pos += 2;

		// For each unit in the data, read the unit's data.
		for (let i = 0; i < unitCount; ++i)
		{
			// Read unit ID.
			// NOTE: if the unit ID is not found, read the rest of the values
			// anyway, since the read position still has to be advanced.
			const unitId = dataView.getUint16(pos);
			pos += 2;

			// Read the X and Y position.
			const x = dataView.getUint16(pos);
			pos += 2;
			const y = dataView.getUint16(pos);
			pos += 2;

			// Read the platform angle
			const platformAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
			pos += 2;

			// Read the turret offset angle
			const turretOffsetAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
			pos += 2;

			// Now all the data has been read, look up the unit by its ID,
			// and if found update it with these details.
			const unit = this.#gameClient.GetUnitById(unitId);
			if (unit)
			{
				unit.UpdateState(x, y, platformAngle, turretOffsetAngle);
			}
		}
	}
	
	#OnNetworkEvents(dataView, pos)
	{
		// Read the game time. TODO: use this to help smooth game state.
		const gameTime = dataView.getFloat32(pos);
		pos += 4;
		
		// Read the number of events.
		const eventCount = dataView.getUint16(pos);
		pos += 2;
		
		// Read each individual event.
		for (let i = 0; i < eventCount; ++i)
		{
			// Get event type
			const eventType = dataView.getUint8(pos);
			pos += 1;
			
			// Read each type of message with a separate method.
			// Note the types correspond to those listed in NetworkEvent on the server.
			if (eventType === 0)
				pos = this.#ReadProjectileFiredEvent(dataView, pos);
			else if (eventType === 1)
				pos = this.#ReadProjectileHitEvent(dataView, pos);
			else if (eventType === 2)
				pos = this.#ReadUnitDestroyedEvent(dataView, pos);
			else
				throw new Error(`unknown event type '${eventType}'`);
		}
	}
	
	#ReadProjectileFiredEvent(dataView, pos)
	{
		// Projectile ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Read X, Y, angle, speed, range and distance travelled.
		const x = dataView.getUint16(pos);
		pos += 2;
		const y = dataView.getUint16(pos);
		pos += 2;
		const angle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
		pos += 2;
		const speed = dataView.getUint16(pos);
		pos += 2;
		const range = dataView.getUint16(pos);
		pos += 2;
		const distanceTravelled = dataView.getUint16(pos);
		pos += 2;
		
		this.#gameClient.OnProjectileFired(id, x, y, angle, speed, range, distanceTravelled);
		return pos;
	}
	
	#ReadProjectileHitEvent(dataView, pos)
	{
		// Projectile ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Read X, Y
		const x = dataView.getUint16(pos);
		pos += 2;
		const y = dataView.getUint16(pos);
		pos += 2;
		
		this.#gameClient.OnProjectileHit(id, x, y);
		return pos;
	}
	
	#ReadUnitDestroyedEvent(dataView, pos)
	{
		// Unit ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		this.#gameClient.OnUnitDestroyed(id);
		return pos;
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
	
	#OnGameOver(m)
	{
		const winningPlayer = m["winning-player"];
		const didWin = (this.#gameClient.GetPlayer() === winningPlayer);
		this.#gameClient.OnGameOver(didWin);
	}
	
	// Received every 1 second as the server sends stats messages.
	// Display the received statistics in the StatsText object.
	#OnStats(m)
	{
		const runtime = this.#gameClient.GetRuntime();
		const inst = runtime.objects.StatsText.getFirstInstance();
		inst.text = `Server FPS: ${m["server-fps"]}
Server thread CPU: ${Math.round(m["server-thread-usage"] * 100)}%
Net state: ${Math.round(m["sent-state-bytes"] / 1024)} kb/s
Net events: ${Math.round(m["sent-event-bytes"] / 1024)} kb/s
Net total: ${Math.round((m["sent-state-bytes"] + m["sent-event-bytes"]) / 1024)} kb/s
Unit count: ${m["num-units"]}
Projectile count: ${m["num-projectiles"]}`;
	}
}