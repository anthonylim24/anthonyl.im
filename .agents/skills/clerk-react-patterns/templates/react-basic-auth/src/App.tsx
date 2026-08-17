import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react"

function App() {
	return (
		<>
			<header>
				<Show when="signed-out" treatPendingAsSignedOut={false}>
					<SignInButton />
					<SignUpButton />
				</Show>
				<Show when="signed-in">
					<UserButton />
				</Show>
			</header>
		</>
	)
}

export default App
