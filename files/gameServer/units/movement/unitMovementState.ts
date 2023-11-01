
 import { UnitMovementController } from "./unitMovementController.js";

// UnitMovementState is a base class for the state classes that manage each of the possible
// movement states for UnitMovementController.
export class UnitMovementState {

	#controller;			// UnitMovementController this state belongs to
	
	constructor(controller: UnitMovementController)
	{
		this.#controller = controller;
	}
	
	Release()
	{
	}
	
	Tick(dt: number)
	{
		// override
	}
	
	// Some helper methods for derived classes (especially as derived classes can't
	// access the private #controller property).
	GetController()
	{
		return this.#controller;
	}
	
	GetWaypoints()
	{
		return this.#controller.GetWaypoints();
	}
	
	GetUnitPlatform()
	{
		return this.#controller.GetUnitPlatform();
	}
	
	GetUnit()
	{
		return this.#controller.GetUnit();
	}
	
	GetGameServer()
	{
		return this.#controller.GetGameServer();
	}
	
	SetUnitDebugState(n: number)
	{
		this.GetUnit().SetDebugState(n);
	}
}