
import { NetworkEvent } from "./networkEvent.js";

// The UnitDestroyed event tells clients that a unit was destroyed.
export class UnitDestroyedEvent extends NetworkEvent {
	
	#unitId;			// ID of unit that was destroyed
	
	constructor(unitId: number)
	{
		super();
		
		this.#unitId = unitId;
	}
	
	Write(dataView: DataView, pos: number)
	{
		// Event type
		dataView.setUint8(pos, NetworkEvent.TYPE_UNIT_DESTROYED);
		pos += 1;
		
		// Unit ID
		dataView.setUint16(pos, this.#unitId);
		pos += 2;
		
		return pos;
	}
}