
// The NetworkEvent class represents a one-off event that happened, like a projectile being fired.
// All the events that happen in a tick are queued up and sent in one go as a binary events message.
// This is a base class - see the derived classes for each kind of network event.
export class NetworkEvent {

	// NetworkEvents in binary messages start with a byte indicating the event type.
	// This is a list of the values for every kind of network event.
	static TYPE_FIRE_PROJECTILE = 0;
	static TYPE_PROJECTILE_HIT = 1;
	
	constructor()
	{
	}
	
	Write(dataView, pos)
	{
		// overridden by derived classes
	}
}