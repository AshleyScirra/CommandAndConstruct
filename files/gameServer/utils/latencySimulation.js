import { PromiseThrottle } from "./promiseThrottle.js";
// Latency simulation to help with testing under poor network conditions.
// This is implemented as part of GameServer, rather than using the equivalent
// Multiplayer object feature, so it can also be used in single player mode.
function Wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// PromiseThrottles to ensure ordered messages aren't reordered by latency simulation
const sendThrottle = new PromiseThrottle();
const receiveThrottle = new PromiseThrottle();
// Latency simulation settings
const ENABLE_LATENCY_SIMULATION = false;
const SIMULATE_BASE_LATENCY = 200; // base latency in ms
const SIMULATE_PDV = 200; // packet delay variation in ms (as random addition)
const SIMULATE_PACKET_LOSS = 0.2; // packet loss as a percentage
// The main send/receive messaging methods await this to simulate latency.
// It resolves with false if the packet is to be simulated as dropped due to packet loss.
export async function WaitForSimulatedLatency(transmissionMode, direction) {
    // Skip if not simulating latency. Also skip if no transmission mode is specified;
    // this is used for control messages between the multiplayer host and GameServer
    // which never go over the network so shouldn't have any latency added.
    if (!ENABLE_LATENCY_SIMULATION || !transmissionMode)
        return true;
    // Simulate packet loss for unreliable transmission by ignoring random messages
    if (transmissionMode === "u") {
        if (Math.random() < SIMULATE_PACKET_LOSS)
            return false;
    }
    // For the reliable channels, if we are simulating packet loss then we multiply up
    // the simulated latency when a packet is "lost". This is to simulate a lost packet,
    // a response from the other end indicating it's missing, then retransmission. Thus
    // instead of a one-way journey there is a three-way journey, so we multiply by 3.
    let multiplier = 1;
    if (transmissionMode !== "u" && Math.random() < SIMULATE_PACKET_LOSS) {
        multiplier = 3;
    }
    // Wait for a time delay based on the simulated latency and PDV
    const waitPromise = Wait((SIMULATE_BASE_LATENCY + Math.random() * SIMULATE_PDV) * multiplier);
    let promise = waitPromise;
    // Waiting for random time delays could cause messages sent with ordered transmission
    // to become unordered. To avoid this, use a promise throttle to ensure the original
    // sequence is preserved, essentially simulating head-of-line blocking.
    if (transmissionMode === "o") {
        if (direction === "send")
            promise = sendThrottle.Add(() => waitPromise);
        else
            promise = receiveThrottle.Add(() => waitPromise);
    }
    // Wait for the delay (and possibly the throttle to sequence messages).
    await promise;
    return true;
}
