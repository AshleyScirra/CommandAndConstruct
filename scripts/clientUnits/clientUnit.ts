
import { GameClient } from "../gameClient/gameClient.js";
import { ClientPlatform } from "./clientPlatform.js";
import { ClientTurret } from "./clientTurret.js";

// For development purposes only: whether to show a Text object with the current
// debug state above units.
const SHOW_UNIT_DEBUG_STATE = true;

// If a unit is not updated by the server for this long, it will be destroyed on the
// assumption something got out of sync. This is currently set to 7 seconds as the
// server sends full updates every 2 seconds, and so this time means the unit likely
// missed 3 opportunities in a row for a full update.
const CLIENT_UNIT_TIMEOUT = 7;

type ClientUnitInfoType = {
	id: number, player: number,
	x: number, y: number, platformAngle: number, speed: number,
	turretOffsetAngle: number
}

// The ClientUnit class represents a unit in GameClient.
// Its main job is to synchronise state to match what is happening on GameServer,
// which holds the real Unit class that represents the authoritative state of the game.
export class ClientUnit {

	// Private fields
	#gameClient;				// reference to GameClient unit belongs to
	#id = -1;					// unique ID of this unit
	#player = 0;				// player this unit belongs to
	#platform?: ClientPlatform;	// ClientPlatform for this unit's platform
	#turret?: ClientTurret;		// ClientTurret for this unit's turret
	// Construct instance representing selection box
	#selectionBoxInst: InstanceType.UnitSelectionBox | null;
	#lastUpdateTime = 0;		// last time received any update from server
	
	// For development purposes only: current unit debug state and a Text object
	// instance in which to display the debug state
	#debugState = 0;
	#debugTextInst?: InstanceType.DebugStateText;
	
	constructor(gameClient: GameClient, id: number, player: number)
	{
		this.#gameClient = gameClient;
		this.#id = id;
		this.#player = player;
		this.#selectionBoxInst = null;
		
		// If enabled, create a debug text instance for this unit
		if (SHOW_UNIT_DEBUG_STATE)
		{
			const runtime = gameClient.GetRuntime();
			this.#debugTextInst = runtime.objects.DebugStateText.createInstance("DebugOverlay", 0, 0);
		}
		
		// Add GameClient state for this unit
		this.#gameClient.UnitWasCreated(this);
	}
	
	// Create a client unit with initial state specified in 'info' object
	static Create(gameClient: GameClient, info: ClientUnitInfoType)
	{
		const unit = new ClientUnit(gameClient, info.id, info.player);
		unit.#platform = new ClientPlatform(unit, info.x, info.y, info.platformAngle, info.speed);
		unit.#turret = new ClientTurret(unit, info.turretOffsetAngle);
		unit.#turret.Update();
		unit.UpdateDebugTextPosition();
		return unit;
	}
	
	Release()
	{
		// Clean up GameClient state for this unit
		this.#gameClient.UnitWasDestroyed(this);
		
		// Destroy turret and platform
		this.#turret!.Release();
		this.#platform!.Release();
		
		// Destroy any debug text instance
		if (this.#debugTextInst)
			this.#debugTextInst.destroy();
	}
	
	GetGameClient()
	{
		return this.#gameClient;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetId()
	{
		return this.#id;
	}
	
	GetPlayer()
	{
		return this.#player;
	}
	
	GetPlatform()
	{
		return this.#platform!;
	}
	
	GetTurret()
	{
		return this.#turret!;
	}
	
	// Called when any update about this unit is received over the network.
	SetLastUpdateTime(serverTime: number)
	{
		this.#lastUpdateTime = Math.max(this.#lastUpdateTime, serverTime);
	}
	
	// Check if the unit has timed out, which is when it last got any update
	// longer than CLIENT_UNIT_TIMEOUT ago from the current time.
	IsTimedOut(simulationTime: number)
	{
		return this.#lastUpdateTime < simulationTime - CLIENT_UNIT_TIMEOUT;
	}
	
	// Set whether this unit will have Tick() called every tick.
	SetTicking(shouldTick: boolean)
	{
		this.#gameClient.SetUnitTicking(this, shouldTick);
	}
	
	// Called every tick (if the unit is opted in to ticking).
	Tick(dt: number, simulationTime: number)
	{
		// Tick the platform and turret. Both return a boolean indicating if they
		// still need ticking.
		const keepTickingPlatform = this.#platform!.Tick(dt, simulationTime);
		const keepTickingTurret = this.#turret!.Tick(dt, simulationTime);
		
		// If neither the platform nor turret needs ticking any more,
		// opt out of ticking to save CPU time.
		if (!keepTickingPlatform && !keepTickingTurret)
		{
			this.SetTicking(false);
		}
	}
	
	// Update the selection box position and angle to match the unit platform.
	UpdateSelectionBox()
	{
		if (!this.#selectionBoxInst)
			return;		// no selection box
		
		const [x, y] = this.#platform!.GetPosition();
		const angle = this.#platform!.GetAngle();
		
		this.#selectionBoxInst.setPosition(x, y);
		this.#selectionBoxInst.angle = angle;
	}
	
	// For updating the position of the debug text when used during development.
	UpdateDebugTextPosition()
	{
		if (!this.#debugTextInst)
			return;		// not in use
		
		const [x, y] = this.#platform!.GetPosition();
		this.#debugTextInst.setPosition(x, y - 50);
	}
	
	// Use the unit platform for collision checks.
	ContainsPoint(x: number, y: number)
	{
		return this.#platform!.ContainsPoint(x, y);
	}
	
	SetSelectedState(isSelected: boolean)
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
			const [x, y] = this.#platform!.GetPosition();
			const [w, h] = this.#platform!.GetSize();
			const angle = this.#platform!.GetAngle();

			this.#selectionBoxInst = runtime.objects.UnitSelectionBox.createInstance("SelectionBoxes", x, y);
			this.#selectionBoxInst.setSize(w + 8, h + 8);
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
	
	SetDebugState(n: number)
	{
		this.#debugState = n;
		
		// Update debug text object if showing
		if (this.#debugTextInst)
		{
			// Debug state is currently used for movement state
			const MOVE_STATES = ["none", "stopping", "rotate-first", "moving", "reverse"];
			
			this.#debugTextInst.text = MOVE_STATES[n] || "???";
			
			// Treat debug state 0 as making the text object invisible (i.e. nothing to report),
			// otherwise show the text object with the current state.
			this.#debugTextInst.isVisible = (n !== 0);
			
		}
	}
	
	GetDebugState()
	{
		return this.#debugState;
	}
}