import { useState } from "react";
import Lobby from "@/components/lobby";
import ChatRoom from "@/components/chatroom";
import type { Session } from "@/shared/types";

function App() {
	const [session, setSession] = useState<Session | null>(null);

	if (!session) {
		return <Lobby onEnter={setSession} />;
	}

	return <ChatRoom {...session} />;
}

export default App;
