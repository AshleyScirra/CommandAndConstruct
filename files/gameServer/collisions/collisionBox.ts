
// The CollisionBox class represents an axis-aligned bounding box of something collidable on the
// collision grid. As it moves it will update which collision cells it is in.
export class CollisionBox {

	#collisionGrid;				// CollisionGrid this box belongs to
	#owner;						// The thing to insert in to the collision cell
	
	// Keep the last collision cells the box was in, so the cells are only updated if changed.
	// This is a rectangle in units of cells, and note the right/bottom sides are inclusive.
	#lastCellLeft = 0;
	#lastCellTop = 0;
	#lastCellRight = 0;
	#lastCellBottom = 0;
	
	constructor(gameServer, owner)
	{
		this.#collisionGrid = gameServer.GetCollisionGrid();
		this.#owner = owner;
	}
	
	// Update which collision cells the box is in based on its rectangle in layout co-ordinates.
	Update(left, top, right, bottom)
	{
		// Convert the rectangle in to cell co-ordinates.
		const [cellLeft, cellTop] = this.#collisionGrid.PositionToCell(left, top);
		const [cellRight, cellBottom] = this.#collisionGrid.PositionToCell(right, bottom);
		
		// If the collision cells this box is in remain unchanged, don't do anything.
		if (cellLeft === this.#lastCellLeft &&
			cellTop === this.#lastCellTop &&
			cellRight === this.#lastCellRight &&
			cellBottom === this.#lastCellBottom)
		{
			return;
		}
		
		// The collision cells this box is in have changed. First remove the owner from the
		// old collision cell range, then reinsert it to the new collision cell range.
		this.#collisionGrid.Remove(this.#owner, this.#lastCellLeft, this.#lastCellTop, this.#lastCellRight, this.#lastCellBottom);
		this.#collisionGrid.Add(this.#owner, cellLeft, cellTop, cellRight, cellBottom);
		
		// Update the last collision cell range.
		this.#lastCellLeft = cellLeft;
		this.#lastCellTop = cellTop;
		this.#lastCellRight = cellRight;
		this.#lastCellBottom = cellBottom;
	}
	
	// When released make sure the owner is removed from any collision cells it is still in.
	Release()
	{
		this.#collisionGrid.Remove(this.#owner, this.#lastCellLeft, this.#lastCellTop, this.#lastCellRight, this.#lastCellBottom);
	}
}