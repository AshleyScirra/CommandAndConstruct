import * as MathUtils from "../utils/mathUtils.js";
import { GameServer } from "../gameServer.js";
import { UnitPlatform } from "../units/unitPlatform.js";
// Size of a collision cell in layout co-ordinates.
// Cells are square so use this size on both dimensions.
const COLLISION_CELL_SIZE = 2000;
// The CollisionGrid class implements the "collision cells" optimisation. It splits up the layout
// in to boxes sized COLLISION_CELL_SIZE, and keeps track of which objects are inside which cells.
// Then things like turret range checks and projectile collision detection can only test against
// nearby objects in the relevant cells, rather than everything in the entire game.
export class CollisionGrid {
    #gameServer; // Reference to GameServer
    // Number of collision cells horizontally and vertically in the layout
    #horizCellCount = 0;
    #vertCellCount = 0;
    // A two-dimensional array of collision cells, based on X axis first then Y axis.
    // Each collision cell is just a Set of all the objects in that location.
    #cells = [];
    constructor(gameServer) {
        this.#gameServer = gameServer;
        // Calculate how many collision cells cover the layout. Make sure to round up
        // fractional results so an entire cell is created for the last row/column in the layout.
        const [layoutWidth, layoutHeight] = gameServer.GetLayoutSize();
        this.#horizCellCount = Math.ceil(layoutWidth / COLLISION_CELL_SIZE);
        this.#vertCellCount = Math.ceil(layoutHeight / COLLISION_CELL_SIZE);
        // Initialise the two-dimensional cells array with an empty Set for each cell.
        for (let x = 0; x < this.#horizCellCount; ++x) {
            const arr = [];
            for (let y = 0; y < this.#vertCellCount; ++y) {
                arr.push(new Set());
            }
            this.#cells.push(arr);
        }
    }
    // Convert a given layout co-ordinate in to cell co-ordinates.
    PositionToCell(x, y) {
        return [Math.floor(x / COLLISION_CELL_SIZE), Math.floor(y / COLLISION_CELL_SIZE)];
    }
    // A helper iterator to iterate all collision cells in the given cell range.
    *#cellsInRange(cellLeft, cellTop, cellRight, cellBottom) {
        // Clamp the collision cell range to the dimensions in use.
        cellLeft = MathUtils.Clamp(cellLeft, 0, this.#horizCellCount - 1);
        cellTop = MathUtils.Clamp(cellTop, 0, this.#vertCellCount - 1);
        cellRight = MathUtils.Clamp(cellRight, 0, this.#horizCellCount - 1);
        cellBottom = MathUtils.Clamp(cellBottom, 0, this.#vertCellCount - 1);
        // Iterate all the cells in the given range. Note this is inclusive, so the
        // right/bottom cell is also iterated.
        for (let cellX = cellLeft; cellX <= cellRight; ++cellX) {
            for (let cellY = cellTop; cellY <= cellBottom; ++cellY) {
                yield this.#cells[cellX][cellY];
            }
        }
    }
    // Remove an item from a given cell range.
    Remove(item, cellLeft, cellTop, cellRight, cellBottom) {
        for (const cellSet of this.#cellsInRange(cellLeft, cellTop, cellRight, cellBottom)) {
            cellSet.delete(item);
        }
    }
    // Add an item to a given cell range.
    Add(item, cellLeft, cellTop, cellRight, cellBottom) {
        for (const cellSet of this.#cellsInRange(cellLeft, cellTop, cellRight, cellBottom)) {
            cellSet.add(item);
        }
    }
    // Call the given callback for every item that might be in the given rectangle in
    // layout co-ordinates. This is the main method used by callers to filter objects in
    // the layout to just those in the relevant area. Also note:
    // 1) Most importantly, that there can be multiple calls to the callback for the same
    //    item. This is because items can be in multiple collision cells, and this method
    //    iterates all the items in each collision cell.
    // 2) This iterates contents by collision cell, so it can cover more items than are in
    //    the actual specified rectangle. This should not generally matter.
    // 3) The most natural way to write this would be to make it a generator function.
    //    However profiling in Chrome showed this was still too slow, and using a callback
    //    was significantly faster.
    ForEachItemInArea(left, top, right, bottom, callback) {
        // Get the given rectangle as a cell range.
        const [cellLeft, cellTop] = this.PositionToCell(left, top);
        const [cellRight, cellBottom] = this.PositionToCell(right, bottom);
        // Iterate all the cells in this range.
        for (const cellSet of this.#cellsInRange(cellLeft, cellTop, cellRight, cellBottom)) {
            // Iterate all the items in this cell.
            for (const item of cellSet) {
                // Call the callback with this item.
                const result = callback(item);
                // If the callback returns true, cancel iteration. The easiest way to do
                // that from nested loops is just to return from this whole function.
                if (result)
                    return;
            }
        }
    }
}
