
import { ClientPlatform } from "./clientPlatform.js";

// The ClientUnit class represents a unit in GameClient.
// Its main job is to synchronise state to match what is happening on GameServer,
// which holds the real Unit class that represents the authoritative state of the game.
export class ClientUnit {

	// Private fields
	#gameClient;				// reference to GameClient unit belongs to
	#id = -1;					// unique ID of this unit
	#platform;					// ClientPlatform for this unit's platform
	#selectionBoxInst;			// Construct instance representing selection box
	
	constructor(gameClient, id)
	{
		this.#gameClient = gameClient;
		this.#id = id;
	}
	
	// Create a single client unit for the "create-initial-state" message
	static CreateFromInitialData(gameClient, unitData)
	{
		const id = unitData["id"];
		const x = unitData["x"];
		const y = unitData["y"];
		
		const unit = new ClientUnit(gameClient, id);
		unit.#platform = new ClientPlatform(unit, x, y);
		return unit;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetId()
	{
		return this.#id;
	}
	
	// Called to update the client unit state with data received from GameServer.
	UpdateState(x, y, angle)
	{
		// Update the unit position and angle.
		this.#platform.SetPosition(x, y);
		this.#platform.SetAngle(angle);
		
		// If this unit has a selection box, update that too.
		if (this.#selectionBoxInst)
		{
			this.#selectionBoxInst.x = x;
			this.#selectionBoxInst.y = y;
			this.#selectionBoxInst.angle = angle;
		}
	}
	
	// Use the unit platform for collision checks.
	ContainsPoint(x, y)
	{
		return this.#platform.ContainsPoint(x, y);
	}
	
	SetSelectedState(isSelected)
	{
		if (isSelected)		// marking selected
		{
			if (this.#selectionBoxInst)
				return;		// already created selection box
			
			// Create a UnitSelectionBox instance, which is a 9-patch object,
			// to represent the selected state of this unit. Make the selection
			// box match the position and angle of the unit platform, and size
			// it a little larger so the green border is visible around it.
			const runtime = this.GetRuntime();
			const [x, y] = this.#platform.GetPosition();
			const [w, h] = this.#platform.GetSize();
			const angle = this.#platform.GetAngle();

			this.#selectionBoxInst = runtime.objects.UnitSelectionBox.createInstance("SelectionBoxes", x, y);
			this.#selectionBoxInst.width = w + 8;
			this.#selectionBoxInst.height = h + 8;
			this.#selectionBoxInst.angle = angle;
		}
		else				// marking not selected
		{
			// Remove the selection box instance if any
			if (!this.#selectionBoxInst)
				return;		// already don't have selection box
			
			this.#selectionBoxInst.destroy();
			this.#selectionBoxInst = null;
		}
	}
}