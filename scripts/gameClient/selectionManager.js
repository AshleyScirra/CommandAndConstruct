
import { MultiEventHandler } from "../utils/multiEventHandler.js";

// The SelectionManager class manages selecting units.
// It has its own class to avoid cluttering GameClient and organise
// as much of the relevant code as possible in a single place.
export class SelectionManager {

	// Private fields
	#gameClient;					// Reference to GameClient
	#selectedUnits = new Set();		// Set of all currently selected units
	#eventHandlers;					// MultiEventHandler for selection events
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		const runtime = this.#gameClient.GetRuntime();
		
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"pointerdown",		e => this.#OnPointerDown(e)]
		]);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	IsSelected(unit)
	{
		return this.#selectedUnits.has(unit);
	}
	
	SetSelected(unit, isSelected)
	{
		if (isSelected)		// setting selected
		{
			if (this.IsSelected(unit))
				return;		// already selected

			// Add this unit to the set of selected units,
			// and put the unit in a selected state to make this state visible.
			this.#selectedUnits.add(unit);
			unit.SetSelectedState(true);
		}
		else				// setting not selected
		{
			if (!this.IsSelected(unit))
				return;		// already not selected

			// Do the reverse: remove the unit from the set of selected units
			// and revert the unit back to an unselected state.
			this.#selectedUnits.delete(unit);
			unit.SetSelectedState(false);
		}
	}
	
	#OnPointerDown(e)
	{
		// Determine the position of the pointer on the UnitPlatforms layer.
		const runtime = this.GetRuntime();
		const unitPlatformsLayer = runtime.layout.getLayer("UnitPlatforms");
		const [ layerX, layerY ] = unitPlatformsLayer.cssPxToLayer(e.clientX, e.clientY);
		
		// Check every unit to see which is at this position (if any).
		for (const unit of this.#gameClient.allUnits())
		{
			// Skip already-selected units.
			if (this.IsSelected(unit))
				continue;
			
			// If we found a unit at this point, make it selected.
			// Note that we also break out of the for loop so only one unit
			// can be selected per pointerdown event.
			if (unit.ContainsPoint(layerX, layerY))
			{
				this.SetSelected(unit, true);
				break;
			}
		}
	}
}