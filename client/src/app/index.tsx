import { WorkspaceLayout } from "../features/layout/WorkspaceLayout";
import { BoardActions } from "../features/whiteboard/BoardActions";
import { WhiteboardView } from "../features/whiteboard/WhiteboardView";

export default function BoardScreen() {
  return (
    <WorkspaceLayout actions={<BoardActions />}>
      <WhiteboardView />
    </WorkspaceLayout>
  );
}
