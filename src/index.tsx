import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import NDK, { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import "./index.css";

// Calculate the number of leading zero bits in a hex string (event ID)
function countLeadingZeroBits(hex: string): number {
    let bits = 0;
    
    for (let i = 0; i < hex.length; i++) {
        const nibble = parseInt(hex[i], 16);
        
        if (nibble === 0) {
            bits += 4;
        } else {
            // Count leading zeros in this nibble
            if (nibble < 8) bits += 1;
            if (nibble < 4) bits += 1;
            if (nibble < 2) bits += 1;
            break;
        }
    }
    
    return bits;
}

interface NoteWithPoW {
    event: NDKEvent;
    pow: number;
}

function App() {
    const [notes, setNotes] = useState<NoteWithPoW[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [relayStatus, setRelayStatus] = useState("Connecting...");
    const [stats, setStats] = useState({
        totalNotes: 0,
        notesWithPoW: 0,
        averagePoW: 0,
        maxPoW: 0
    });

    useEffect(() => {
        const initializeNDK = async () => {
            try {
                // Initialize NDK with explicit relay URLs
                const ndk = new NDK({
                    explicitRelayUrls: [
                        "wss://relay.damus.io",
                        "wss://relay.nostr.band",
                        "wss://nos.lol",
                        "wss://nostr.wine",
                        "wss://relay.snort.social"
                    ],
                });

                // Connect to relays
                await ndk.connect();
                setRelayStatus("Connected");

                // Create filter for text notes (kind 1)
                const filter: NDKFilter = {
                    kinds: [1],
                    limit: 100,
                    since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
                };

                // Fetch events
                const events = await ndk.fetchEvents(filter);
                console.log(`Fetched ${events.size} events`);

                // Process events and calculate PoW
                const notesWithPoW: NoteWithPoW[] = [];
                let totalPoW = 0;
                let maxPoW = 0;
                let notesWithPoWCount = 0;

                events.forEach(event => {
                    const pow = countLeadingZeroBits(event.id);
                    
                    // Check if event has nonce tag (indicates intentional PoW)
                    const hasNonceTag = event.tags.some(tag => tag[0] === "nonce");
                    
                    if (pow > 0 || hasNonceTag) {
                        notesWithPoW.push({ event, pow });
                        
                        if (pow > 0) {
                            notesWithPoWCount++;
                            totalPoW += pow;
                            maxPoW = Math.max(maxPoW, pow);
                        }
                    }
                });

                // Sort by PoW (highest first)
                notesWithPoW.sort((a, b) => b.pow - a.pow);

                setNotes(notesWithPoW);
                setStats({
                    totalNotes: events.size,
                    notesWithPoW: notesWithPoWCount,
                    averagePoW: notesWithPoWCount > 0 ? totalPoW / notesWithPoWCount : 0,
                    maxPoW
                });
                setLoading(false);

                // Set up subscription for new events
                const sub = ndk.subscribe(filter, { closeOnEose: false });
                
                sub.on("event", (event: NDKEvent) => {
                    const pow = countLeadingZeroBits(event.id);
                    const hasNonceTag = event.tags.some(tag => tag[0] === "nonce");
                    
                    if (pow > 0 || hasNonceTag) {
                        setNotes(prev => {
                            const newNotes = [{ event, pow }, ...prev];
                            return newNotes.sort((a, b) => b.pow - a.pow);
                        });
                    }
                });

            } catch (err) {
                console.error("Error initializing NDK:", err);
                setError(err instanceof Error ? err.message : "Failed to connect to Nostr");
                setRelayStatus("Not Connected");
                setLoading(false);
            }
        };

        initializeNDK();
    }, []);

    const getPowBadgeClass = (pow: number): string => {
        if (pow >= 20) return "pow-high";
        if (pow >= 10) return "pow-medium";
        return "pow-low";
    };

    const formatTime = (timestamp: number): string => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    const truncatePublicKey = (pubkey: string): string => {
        return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
    };

    return (
        <div className="container">
            <h1>Nostr Proof of Work Explorer</h1>
            
            <div className="relay-status">{relayStatus}</div>

            {error && (
                <div className="error">{error}</div>
            )}

            <div className="stats">
                <h2>Statistics (Last 24 Hours)</h2>
                <p>Total Notes: {stats.totalNotes}</p>
                <p>Notes with PoW: {stats.notesWithPoW}</p>
                <p>Average PoW: {stats.averagePoW.toFixed(2)} bits</p>
                <p>Maximum PoW: {stats.maxPoW} bits</p>
            </div>

            {loading ? (
                <div className="loading">Loading notes...</div>
            ) : (
                <div className="notes-container">
                    {notes.length === 0 ? (
                        <div className="loading">No notes with PoW found in the last 24 hours</div>
                    ) : (
                        notes.map((note) => (
                            <div key={note.event.id} className="note">
                                <div className="note-header">
                                    <div className="note-author">
                                        {truncatePublicKey(note.event.pubkey)}
                                    </div>
                                    <div className={`pow-badge ${getPowBadgeClass(note.pow)}`}>
                                        {note.pow} bits PoW
                                    </div>
                                </div>
                                <div className="note-content">
                                    {note.event.content}
                                </div>
                                <div className="note-time">
                                    {formatTime(note.event.created_at!)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);