
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
	
	IsAnyUnitSelected()
	{
		return this.#selectedUnits.size > 0;
	}
	
	// Set a given unit selected or unselected.
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
	
	// Unselect all units at once. This is the same as calling
	// SetSelected(unit, false) on every selected unit.
	UnselectAll()
	{
		// Unset the selected state of all selected units.
		for (const unit of this.#selectedUnits)
		{
			unit.SetSelectedState(false);
		}
		
		// Clear the entire selected units set.
		this.#selectedUnits.clear();
	}
	
	#OnPointerDown(e)
	{
		// A button value of 0 means the left mouse button, or a non-mouse input
		// like a touch or a pen input.
		if (e.button === 0)
		{
			this.#OnPointerDown_MainButton(e);
		}
		// A button value of 2 means the right mouse button. This can't be used
		// via touch input though.
		else if (e.button === 2)
		{
			this.#OnPointerDown_RightButton(e);
		}
	}
	
	#OnPointerDown_MainButton(e)
	{
		// Determine the position of the pointer on the UnitPlatforms layer.
		const runtime = this.GetRuntime();
		const unitPlatformsLayer = runtime.layout.getLayer("UnitPlatforms");
		const [ layerX, layerY ] = unitPlatformsLayer.cssPxToLayer(e.clientX, e.clientY);
		
		// Clicking a unit directly should select it, but clicking elsewhere
		// on the ground should command any selected units to move there.
		// Track whether the pointer down hit any unit at all.
		let didHitUnit = false;
		
		// Check every unit to see which is at this position (if any).
		for (const unit of this.#gameClient.allUnits())
		{
			// Found a unit that the pointer down hit.
			if (unit.ContainsPoint(layerX, layerY))
			{
				// Flag that a unit was hit.
				didHitUnit = true;
				
				// If the hit unit is already selected, skip it.
				// This allows checking if another unselected unit
				// is at this position.
				if (this.IsSelected(unit))
				{
					continue;
				}
				else
				{
					// Hit an unselected unit: make it selected.
					// Note that we also break out of the for loop so only one unit
					// can be selected per pointerdown event.
					this.SetSelected(unit, true);
					break;
				}
			}
		}
		
		// If the player has at least one unit selected and they click somewhere
		// on open ground (not over another unit), command the selected units
		// to move there. This instruction is handled by GameClient.
		if (this.IsAnyUnitSelected() && !didHitUnit)
		{
			this.#gameClient.MoveUnits([...this.#selectedUnits], layerX, layerY);
		}
	}
	
	#OnPointerDown_RightButton(e)
	{
		// Unselect all units when pressing the right mouse button.
		this.UnselectAll();
	}
}