import { useAuth } from "@workos-inc/authkit-react";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { api } from "../convex/_generated/api";

export default function App() {
  return (
    <>
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-6 py-3">
          <p className="text-muted-foreground text-sm font-medium">
            Convex + React + WorkOS AuthKit + Shadcn
          </p>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <AuthButton />
          </div>
        </div>
      </header>
      <main className="flex flex-col gap-16 p-8">
        <h1 className="text-4xl font-bold text-center">
          Convex + React + WorkOS AuthKit + Shadcn
        </h1>
        <Authenticated>
          <Content />
        </Authenticated>
        <Unauthenticated>
          <div className="bg-card text-card-foreground border-border mx-auto flex w-full max-w-sm flex-col gap-8 rounded-lg border p-6 shadow-sm">
            <p>Log in to see the numbers</p>
            <AuthButton />
          </div>
        </Unauthenticated>
      </main>
    </>
  );
}

function AuthButton() {
  const { user, signIn, signOut } = useAuth();

  if (user) {
    return (
      <Button onClick={() => signOut()} variant="outline">
        Sign out
      </Button>
    );
  }

  return <Button onClick={() => void signIn()}>Sign in</Button>;
}

function Content() {
  const { viewer, numbers } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};
  const addNumber = useMutation(api.myFunctions.addNumber);

  if (viewer === undefined || numbers === undefined) {
    return (
      <div className="mx-auto">
        <p>loading... (consider a loading skeleton)</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <p>Welcome {viewer ?? "Anonymous"}!</p>
      <p>
        Click the button below and open this page in another window - this data
        is persisted in the Convex cloud database!
      </p>
      <p>
        <Button
          onClick={() => {
            void addNumber({ value: Math.floor(Math.random() * 10) });
          }}
        >
          Add a random number
        </Button>
      </p>
      <p>
        Numbers:{" "}
        {numbers?.length === 0
          ? "Click the button!"
          : (numbers?.join(", ") ?? "...")}
      </p>
      <p>
        Edit{" "}
        <code className="bg-muted text-muted-foreground rounded-md px-1 py-0.5 font-mono text-sm font-bold">
          convex/myFunctions.ts
        </code>{" "}
        to change your backend
      </p>
      <p>
        Edit{" "}
        <code className="bg-muted text-muted-foreground rounded-md px-1 py-0.5 font-mono text-sm font-bold">
          src/App.tsx
        </code>{" "}
        to change your frontend
      </p>
      <div className="flex flex-col">
        <p className="text-lg font-bold">Useful resources:</p>
        <div className="flex gap-2">
          <div className="flex w-1/2 flex-col gap-2">
            <ResourceCard
              title="Convex docs"
              description="Read comprehensive documentation for all Convex features."
              href="https://docs.convex.dev/home"
            />
            <ResourceCard
              title="Stack articles"
              description="Learn about best practices, use cases, and more from a growing
            collection of articles, videos, and walkthroughs."
              href="https://www.typescriptlang.org/docs/handbook/2/basic-types.html"
            />
          </div>
          <div className="flex w-1/2 flex-col gap-2">
            <ResourceCard
              title="Templates"
              description="Browse our collection of templates to get started quickly."
              href="https://www.convex.dev/templates"
            />
            <ResourceCard
              title="Discord"
              description="Join our developer community to ask questions, trade tips & tricks,
            and show off your projects."
              href="https://www.convex.dev/community"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="bg-card text-card-foreground border-border flex h-28 flex-col gap-2 overflow-auto rounded-md border p-4">
      <a href={href} className="text-sm underline hover:no-underline">
        {title}
      </a>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}
