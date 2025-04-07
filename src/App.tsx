import { useEffect, useRef, useState } from "react";

function App() {
  // WebRTC connection states
  const [connectionStatus, setConnectionStatus] = useState<string>("Not Connected");
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Game state variables
  const [board, setBoard] = useState<string[]>(Array(9).fill(""));
  const [currentPlayer, setCurrentPlayer] = useState<"X" | "O">("X");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 });
  
  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Win patterns for Tic-Tac-Toe
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  // Check if the current board has a winner
  const checkWinner = (boardState: string[]): string | null => {
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
        return boardState[a]; // Return the winning player (X or O)
      }
    }
    // Check for draw
    if (boardState.every(cell => cell !== "")) {
      return "draw";
    }
    return null; // No winner yet
  };

  // Update the game result whenever the board changes
  useEffect(() => {
    const result = checkWinner(board);
    if (result) {
      if (result === "draw") {
        setGameResult("Game ended in a draw!");
        setScores(prev => ({ ...prev, draws: prev.draws + 1 }));
      } else {
        setGameResult(`Player ${result} wins!`);
        setScores(prev => ({
          ...prev,
          [result]: prev[result as keyof typeof prev] + 1
        }));
      }
    }
  }, [board]);

  // Initialize WebRTC connection
  useEffect(() => {
    // Initialize peer connection with STUN servers
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ],
    });

    // Set up ICE candidate handling - properly wait for gathering completion
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("New ICE candidate:", JSON.stringify(event.candidate));
      } else {
        // ICE gathering complete
        console.log("ICE gathering completed");
        if (peerConnectionRef.current?.localDescription) {
          console.log("Complete offer/answer with all candidates:", 
            JSON.stringify(peerConnectionRef.current.localDescription));
        }
      }
    };

    // Monitor connection state 
    peerConnectionRef.current.onconnectionstatechange = () => {
      const state = peerConnectionRef.current?.connectionState;
      console.log("Connection state:", state);
      
      if (state === "connected") {
        setConnectionStatus("WebRTC Connected!");
      } else if (state === "failed" || state === "disconnected" || state === "closed") {
        setConnectionStatus(`Connection ${state}. Try again.`);
        setConnectionError(`WebRTC connection ${state}`);
      }
    };

    // Set up data channel receiver for answering peer
    peerConnectionRef.current.ondatachannel = (event) => {
      console.log("Received data channel from peer");
      dataChannelRef.current = event.channel;
      setupDataChannelHandlers(event.channel);
    };

    // Clean up function
    return () => {
      peerConnectionRef.current?.close();
    };
  }, []);

  // Monitor the data channel state
  useEffect(() => {
    if (dataChannelRef.current) {
      const checkInterval = setInterval(() => {
        const state = dataChannelRef.current?.readyState;
        console.log("Data channel state:", state);
        
        if (state === "open") {
          setIsChannelReady(true);
          setConnectionStatus("Data Channel Connected!");
          clearInterval(checkInterval);
        }
      }, 1000);
      
      return () => clearInterval(checkInterval);
    }
  }, [dataChannelRef.current]);

  // Create an offer (first peer)
  const createOffer = async () => {
    setConnectionError(null);
    
    if (!peerConnectionRef.current) return;

    try {
      // Create data channel with reliable option
      dataChannelRef.current = peerConnectionRef.current.createDataChannel("gameChannel", {
        ordered: true // Guarantees message delivery order
      });
      
      console.log("Created data channel with ID:", dataChannelRef.current.id);
      setupDataChannelHandlers(dataChannelRef.current);

      // Create and set local description
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      // Wait briefly for ICE gathering - not ideal but helps in some cases
      await new Promise(r => setTimeout(r, 500));
      
      // Display offer to be copied - use actual local description which may have candidates
      const currentOffer = peerConnectionRef.current.localDescription || offer;
      console.log("Offer:", JSON.stringify(currentOffer));
      setConnectionStatus("Created Offer - Copy it to other peer");
      
      // Set player as X (first player)
      setCurrentPlayer("X");
      setIsMyTurn(true); // X goes first
      setScores({ X: 0, O: 0, draws: 0 });
    } catch (err) {
      console.error("Error creating offer:", err);
      setConnectionError("Failed to create offer: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Accept an offer (second peer)
  const acceptOffer = async (offerStr: string) => {
    setConnectionError(null);
    
    try {
      if (!peerConnectionRef.current) return;
      
      // Clean the input if it includes the "Offer:" prefix
      const cleanedOfferStr = offerStr.includes("Offer:") 
        ? offerStr.substring(offerStr.indexOf("{")) 
        : offerStr;
      
      const offer = JSON.parse(cleanedOfferStr);
      console.log("Parsed offer:", offer);

      // Set remote description
      await peerConnectionRef.current.setRemoteDescription(offer);
      console.log("Set remote description successfully");
      
      // Create and set answer
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      // Wait briefly for ICE gathering
      await new Promise(r => setTimeout(r, 500));
      
      // Display answer with any gathered candidates
      const currentAnswer = peerConnectionRef.current.localDescription || answer;
      console.log("Answer:", JSON.stringify(currentAnswer));
      setConnectionStatus("Created Answer - Copy it to other peer");
      
      // Set player as O (second player)
      setCurrentPlayer("O");
      setIsMyTurn(false); // X goes first
      setScores({ X: 0, O: 0, draws: 0 });
    } catch (err) {
      console.error("Error accepting offer:", err);
      setConnectionError("Error accepting offer: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Handle the answer from the second peer
  const handleAnswer = async (answerStr: string) => {
    try {
      if (!peerConnectionRef.current) return;
      
      // Clean the input if it includes the "Answer:" prefix
      const cleanedAnswerStr = answerStr.includes("Answer:") 
        ? answerStr.substring(answerStr.indexOf("{")) 
        : answerStr;
      
      const answer = JSON.parse(cleanedAnswerStr);
      console.log("Parsed answer:", answer);
      
      await peerConnectionRef.current.setRemoteDescription(answer);
      console.log("Set remote description successfully");
      setConnectionStatus("Connected! Waiting for data channel...");
    } catch (err) {
      console.error("Error handling answer:", err);
      setConnectionError("Error handling answer: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Set up handlers for the data channel
  const setupDataChannelHandlers = (channel: RTCDataChannel) => {
    console.log("Setting up data channel handlers for channel:", channel.label);
    
    channel.onopen = () => {
      console.log(`Data channel '${channel.label}' opened with state:`, channel.readyState);
      setConnectionStatus("Data Channel Connected!");
      setIsChannelReady(true);
      
      // For the player who created the offer (X), enable their turn
      if (currentPlayer === "X") {
        setIsMyTurn(true);
      }
    };
    
    // Check initial state too
    if (channel.readyState === "open") {
      console.log("Data channel already open:", channel.label);
      setConnectionStatus("Data Channel Connected!");
      setIsChannelReady(true);
    }
    
    channel.onmessage = (event) => {
      console.log("Received message:", event.data);
      try {
        const message = JSON.parse(event.data);
        if (message.type === "move") {
          setBoard(message.board);
          setIsMyTurn(true); // Other player made a move, now it's my turn
        } else if (message.type === "reset") {
          setBoard(Array(9).fill(""));
          setGameResult(null);
          setIsMyTurn(currentPlayer === "X"); // X always starts
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    };
    
    channel.onclose = () => {
      console.log("Data channel closed");
      setConnectionStatus("Data Channel Closed");
      setIsChannelReady(false);
    };
    
    channel.onerror = (err) => {
      console.error("Data channel error:", err);
      setConnectionError("Data channel error: " + err.type);
    };
  };

  // Retry data channel connection if it's stuck
  const retryConnection = () => {
    if (!peerConnectionRef.current) return;
    
    console.log("Retrying connection...");
    setConnectionError(null);
    
    if (currentPlayer === "X") {
      // The offer creator retries creating the channel
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
      
      dataChannelRef.current = peerConnectionRef.current.createDataChannel("gameChannel", {
        ordered: true
      });
      setupDataChannelHandlers(dataChannelRef.current);
      setConnectionStatus("Retrying data channel connection...");
    } else {
      setConnectionStatus("Ask the other player to retry the connection");
    }
  };

  // Make a move on the board
  const makeMove = (index: number) => {
    if (!isMyTurn || board[index] !== "" || gameResult) return;

    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setIsMyTurn(false);

    // Send the updated board to the other peer
    if (dataChannelRef.current?.readyState === "open") {
      const message = JSON.stringify({ type: "move", board: newBoard });
      console.log("Sending move:", message);
      dataChannelRef.current.send(message);
    } else {
      console.warn("Data channel not open:", dataChannelRef.current?.readyState);
      setConnectionError("Connection lost. Try restarting the game.");
    }
  };

  // Reset the game
  const resetGame = () => {
    setBoard(Array(9).fill(""));
    setGameResult(null);
    setIsMyTurn(currentPlayer === "X"); // X always starts

    // Send reset message to other player
    if (dataChannelRef.current?.readyState === "open") {
      const message = JSON.stringify({ type: "reset" });
      console.log("Sending reset:", message);
      dataChannelRef.current.send(message);
    } else {
      setConnectionError("Connection lost. Cannot reset the game.");
    }
  };

  return (
    <div className="max-w-[800px] mx-auto p-8 text-center">
      <h1 className="text-2xl mb-4">WebRTC Tic-Tac-Toe</h1>

      {/* Connection controls */}
      <div className="mb-8">
        <p className="mb-2">
          Status: {connectionStatus}
          {dataChannelRef.current && 
            <span className="ml-2 text-sm">
              (Data: {dataChannelRef.current.readyState})
            </span>
          }
        </p>
        
        {connectionError && (
          <p className="text-red-500 mb-2">{connectionError}</p>
        )}
        
        <div className="mb-4">
          <button 
            onClick={createOffer} 
            className="mr-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Create Offer
          </button>
          <button
            onClick={() => {
              const offer = prompt("Enter offer:");
              if (offer) acceptOffer(offer);
            }}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Accept Offer
          </button>
          <button
            onClick={() => {
              const answer = prompt("Enter answer:");
              if (answer) handleAnswer(answer);
            }}
            className="ml-2 bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
          >
            Set Answer
          </button>
        </div>
        
        {dataChannelRef.current && dataChannelRef.current.readyState !== "open" && (
          <button
            onClick={retryConnection}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Retry Connection
          </button>
        )}
      </div>

      {/* Game section - only show when channel is ready */}
      {isChannelReady && (
        <>
          {/* Game board - now first */}
          <div className="mb-8">
            <h2 className="text-xl mb-2">Tic-Tac-Toe</h2>
            
            {/* Game status */}
            <div className="mb-4">
              {gameResult ? (
                <div>
                  <p className="text-purple-500 text-xl font-bold mb-2">{gameResult}</p>
                  <button 
                    onClick={resetGame}
                    className="bg-purple-600 hover:bg-purple-700 text-white py-1 px-4 rounded-lg"
                  >
                    Play Again
                  </button>
                </div>
              ) : isMyTurn ? (
                <p className="text-green-600">Your turn ({currentPlayer})</p>
              ) : (
                <p className="text-blue-600">Opponent's turn</p>
              )}
            </div>
            
            {/* Game board */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                width: '240px',
                margin: '0 auto'
              }}
            >
              {board.map((cell, index) => {
                // Find if this cell is part of the winning pattern
                const isWinningCell = gameResult && gameResult.includes("wins") && 
                  winPatterns.some(pattern => 
                    pattern.includes(index) && 
                    pattern.every(i => board[i] === board[index]) && 
                    board[index] !== ""
                  );
                  
                return (
                  <button
                    key={index}
                    onClick={() => makeMove(index)}
                    disabled={!isMyTurn || !!gameResult}
                    style={{
                      width: '80px',
                      height: '80px',
                      border: '2px solid #666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      fontWeight: 'bold',
                      cursor: isMyTurn && !gameResult ? 'pointer' : 'not-allowed',
                      opacity: (!isMyTurn || !!gameResult) ? 0.7 : 1,
                      backgroundColor: isWinningCell ? '#4C1D95' : '#1F2937'
                    }}
                  >
                    {cell === 'X' ? (
                      <span style={{ color: '#EF4444' }}>{cell}</span>
                    ) : cell === 'O' ? (
                      <span style={{ color: '#3B82F6' }}>{cell}</span>
                    ) : (
                      ''
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scoreboard - improved table format */}
          <div className="mb-6 p-4 bg-gray-800 rounded-lg max-w-sm mx-auto">
            <h2 className="text-xl font-bold mb-4 text-white">Scoreboard</h2>
            <table className="table-auto w-full text-center text-white">
              <thead>
                <tr className="bg-gray-700">
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-600">
                  <td className="border px-4 py-2 text-red-400 font-bold">X</td>
                  <td className="border px-4 py-2">{scores.X}</td>
                </tr>
                <tr className="bg-gray-700">
                  <td className="border px-4 py-2 text-blue-400 font-bold">O</td>
                  <td className="border px-4 py-2">{scores.O}</td>
                </tr>
                <tr className="bg-gray-600">
                  <td className="border px-4 py-2 text-yellow-400 font-bold">Draws</td>
                  <td className="border px-4 py-2">{scores.draws}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
