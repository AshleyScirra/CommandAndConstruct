
import * as MathUtils from "../../utils/clientMathUtils.js";
import { GameClient } from "../gameClient.js";
import { ClientUnit } from "../../clientUnits/clientUnit.js";

// The SelectionManager class manages selecting units.
// It has its own class to avoid cluttering GameClient and organise
// as much of the relevant code as possible in a single place.
export class SelectionManager {

	// Private fields
	#gameClient;								// Reference to GameClient
	#selectedUnits = new Set<ClientUnit>();		// Set of all currently selected units
	
	constructor(gameClient: GameClient)
	{
		this.#gameClient = gameClient;
	}
	
	Release()
	{
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	IsSelected(unit: ClientUnit)
	{
		return this.#selectedUnits.has(unit);
	}
	
	IsAnyUnitSelected()
	{
		return this.#selectedUnits.size > 0;
	}
	
	// Set a given unit selected or unselected.
	SetSelected(unit: ClientUnit, isSelected: boolean)
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
	
	// Called by a PointerInfo when the pointer down and up positions are close.
	OnTap_MainButton(e: PointerEvent)
	{
		// Determine the position of the pointer on the UnitPlatforms layer.
		const runtime = this.GetRuntime();
		const unitPlatformsLayer = runtime.layout.getLayer("UnitPlatforms")!;
		const [ layerX, layerY ] = unitPlatformsLayer.cssPxToLayer(e.clientX, e.clientY);
		
		// Clicking a unit directly should select it, but clicking elsewhere
		// on the ground should command any selected units to move there.
		// Track whether the pointer down hit any unit at all.
		let didHitUnit = false;
		
		// Check every one of the local player's units to see which is at this position (if any).
		// This stops the player being able to select other player's units. Note the server
		// verifies commands so even a hacked client that selects other player's units will
		// not be able to affect them.
		for (const unit of this.#gameClient.allLocalPlayerUnits())
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
			
			// If the player is not using mouse input (e.g. touch input), they may be
			// unable to use right-click to unselect units. So automatically unselect
			// all units after issuing a move command so another unit can be selected.
			if (e.pointerType !== "mouse")
				this.UnselectAll();
		}
	}
	
	OnTap_RightMouseButton()
	{
		// Unselect all units when pressing the right mouse button.
		// This can't be used via touch input, so instead when commanding units to move
		// via touch input, all selected units are automatically unselected.
		this.UnselectAll();
	}
	
	SelectAllInRectangle(left: number, top: number, right: number, bottom: number)
	{
		// Called when ending a selection box drag. Select any units whose position is
		// inside the selection box rectangle.
		for (const unit of this.#gameClient.allLocalPlayerUnits())
		{
			const [x, y] = unit.GetPlatform().GetPosition();
			
			if (MathUtils.IsPointInRectangle(x, y, left, top, right, bottom))
			{
				this.SetSelected(unit, true);
			}
		}
	}
}