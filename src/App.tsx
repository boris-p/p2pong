import { useEffect, useRef, useState } from "react";

function App() {
  const [localNumber, setLocalNumber] = useState(0);
  const [receivedNumber, setReceivedNumber] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("Not Connected");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    // Initialize peer connection
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Set up event handlers
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("New ICE candidate:", JSON.stringify(event.candidate));
      }
    };

    return () => {
      peerConnectionRef.current?.close();
    };
  }, []);

  const createOffer = async () => {
    if (!peerConnectionRef.current) return;

    // Create data channel
    dataChannelRef.current =
      peerConnectionRef.current.createDataChannel("numberChannel");
    setupDataChannelHandlers(dataChannelRef.current);

    // Create and set local description
    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);

    // Display offer to be copied
    console.log("Offer:", JSON.stringify(offer));
    setConnectionStatus("Created Offer - Copy it to other peer");
  };

  const handleAnswer = async (answerStr: string) => {
    try {
      if (!peerConnectionRef.current) return;
      const answer = JSON.parse(answerStr);
      await peerConnectionRef.current.setRemoteDescription(answer);
      setConnectionStatus("Connected!");
    } catch (err) {
      console.error("Error setting answer:", err);
      setConnectionStatus("Error connecting");
    }
  };

  const acceptOffer = async (offerStr: string) => {
    try {
      if (!peerConnectionRef.current) return;
      const offer = JSON.parse(offerStr);

      // Set up data channel handler for answering peer
      peerConnectionRef.current.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        setupDataChannelHandlers(event.channel);
      };

      // Set remote description and create answer
      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      // Display answer to be copied
      console.log("Answer:", JSON.stringify(answer));
      setConnectionStatus("Created Answer - Copy it to other peer");
    } catch (err) {
      console.error("Error creating answer:", err);
      setConnectionStatus("Error connecting");
    }
  };

  const setupDataChannelHandlers = (channel: RTCDataChannel) => {
    channel.onopen = () => {
      setConnectionStatus("Data Channel Connected!");
    };
    channel.onmessage = (event) => {
      setReceivedNumber(Number(event.data));
    };
    channel.onclose = () => {
      setConnectionStatus("Data Channel Closed");
    };
  };

  const sendNumber = () => {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(localNumber.toString());
    }
  };

  return (
    <div className="max-w-[800px] mx-auto p-8 text-center">
      <h1 className="text-2xl mb-4">WebRTC Number Transfer</h1>

      <div className="mb-8">
        <p className="mb-2">Status: {connectionStatus}</p>
        <button onClick={createOffer} className="mr-2">
          Create Offer
        </button>
        <button
          onClick={() => {
            const offer = prompt("Enter offer:");
            if (offer) acceptOffer(offer);
          }}
        >
          Accept Offer
        </button>
        <button
          onClick={() => {
            const answer = prompt("Enter answer:");
            if (answer) handleAnswer(answer);
          }}
          className="ml-2"
        >
          Set Answer
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-xl mb-2">Local Number</h2>
        <input
          type="number"
          value={localNumber}
          onChange={(e) => setLocalNumber(Number(e.target.value))}
          className="p-2 mr-2 text-black"
        />
        <button onClick={sendNumber}>Send Number</button>
      </div>

      <div>
        <h2 className="text-xl mb-2">Received Number</h2>
        <p>{receivedNumber ?? "No number received yet"}</p>
      </div>
    </div>
  );
}

export default App;
