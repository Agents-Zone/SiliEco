"use client";

import { useMemo, useState } from "react";
import { Bot, Search, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@silieco/ui/components/ui/button";
import { Checkbox } from "@silieco/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silieco/ui/components/ui/dialog";
import { Input } from "@silieco/ui/components/ui/input";
import { ScrollArea } from "@silieco/ui/components/ui/scroll-area";
import {
  useCreateGroupChatSession,
  useUpdateGroupChatParticipants,
} from "@silieco/core/chat/mutations";
import type { Agent, ChatSession, MemberWithUser } from "@silieco/core/types";
import { ActorAvatar } from "../../common/actor-avatar";
import { useT } from "../../i18n";

interface CreateGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberWithUser[];
  agents: Agent[];
  currentUserId?: string;
  onCreated: (session: ChatSession) => void;
  session?: ChatSession | null;
}

export function CreateGroupChatDialog({
  open,
  onOpenChange,
  members,
  agents,
  currentUserId,
  onCreated,
  session,
}: CreateGroupChatDialogProps) {
  const { t } = useT("chat");
  const createGroup = useCreateGroupChatSession();
  const updateParticipants = useUpdateGroupChatParticipants();
  const isManaging = session?.kind === "group";
  const lockedMemberId = session?.creator_id ?? currentUserId;
  const existingMemberIds = new Set(
    (session?.participants ?? []).filter((item) => item.type === "member").map((item) => item.id),
  );
  const existingAgentIds = new Set(
    (session?.participants ?? []).filter((item) => item.type === "agent").map((item) => item.id),
  );
  const initialMemberIds = () => new Set(
    isManaging
      ? (session?.participants ?? []).filter((item) => item.type === "member").map((item) => item.id)
      : currentUserId ? [currentUserId] : [],
  );
  const initialAgentIds = () => new Set(
    isManaging
      ? (session?.participants ?? []).filter((item) => item.type === "agent").map((item) => item.id)
      : [],
  );
  const [title, setTitle] = useState(session?.title ?? "");
  const [query, setQuery] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(
    initialMemberIds,
  );
  const [agentIds, setAgentIds] = useState<Set<string>>(initialAgentIds);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleMembers = useMemo(
    () => members.filter((member) =>
      !normalizedQuery || `${member.name} ${member.email}`.toLocaleLowerCase().includes(normalizedQuery)),
    [members, normalizedQuery],
  );
  const visibleAgents = useMemo(
    () => agents.filter((agent) =>
      !normalizedQuery || `${agent.name} ${agent.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)),
    [agents, normalizedQuery],
  );

  const reset = () => {
    setTitle(session?.title ?? "");
    setQuery("");
    setMemberIds(initialMemberIds());
    setAgentIds(initialAgentIds());
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    checked: boolean,
  ) => setter((current) => {
    const next = new Set(current);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  });

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    try {
      const updated = isManaging && session
        ? await updateParticipants.mutateAsync({
            sessionId: session.id,
            member_ids: [...memberIds].filter((id) => id !== session.creator_id),
            agent_ids: [...agentIds],
          })
        : await createGroup.mutateAsync({
            title: cleanTitle,
            member_ids: [...memberIds].filter((id) => id !== currentUserId),
            agent_ids: [...agentIds],
          });
      onCreated(updated);
      onOpenChange(false);
      reset();
    } catch {
      toast.error(t(($) => isManaging ? $.group.update_failed : $.group.create_failed));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && !createGroup.isPending && !updateParticipants.isPending) reset();
      }}
    >
      <DialogContent className="overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(($) => isManaging ? $.group.manage_title : $.group.create_title)}</DialogTitle>
          <DialogDescription>{t(($) => isManaging ? $.group.manage_description : $.group.create_description)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isManaging && (
            <label className="space-y-1.5 pb-2">
              <span className="text-caption font-medium text-foreground">
                {t(($) => $.group.name_label)}
              </span>
              <Input
                value={title}
                maxLength={200}
                autoFocus
                placeholder={t(($) => $.group.name_placeholder)}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && title.trim()) void submit();
                }}
              />
            </label>
          )}

          <div className="overflow-hidden rounded-lg border border-surface-border bg-card">
            <div className="border-b border-surface-border p-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(($) => $.group.search_placeholder)}
                  className="bg-surface pl-8"
                />
              </div>
            </div>

            <ScrollArea className="h-72">
              <ParticipantSection
                icon={<UsersRound className="size-4" />}
                title={t(($) => $.group.people)}
                empty={t(($) => $.group.no_people)}
              >
                {visibleMembers.map((member) => {
                  const isCreator = member.user_id === lockedMemberId;
                  const isLocked = isCreator || existingMemberIds.has(member.user_id);
                  return (
                    <ParticipantRow
                      key={member.user_id}
                      checked={isLocked || memberIds.has(member.user_id)}
                      disabled={isLocked}
                      onCheckedChange={(checked) => toggle(setMemberIds, member.user_id, checked)}
                      avatar={<ActorAvatar actorType="member" actorId={member.user_id} size="md" profileLink={false} />}
                      name={member.name || member.email}
                      detail={isCreator
                        ? member.user_id === currentUserId
                          ? t(($) => $.group.you)
                          : t(($) => $.group.creator)
                        : existingMemberIds.has(member.user_id)
                          ? t(($) => $.group.already_joined)
                          : member.email}
                    />
                  );
                })}
              </ParticipantSection>

              <ParticipantSection
                icon={<Bot className="size-4" />}
                title={t(($) => $.group.agents)}
                empty={t(($) => $.group.no_agents)}
              >
                {visibleAgents.map((agent) => (
                  <ParticipantRow
                    key={agent.id}
                    checked={agentIds.has(agent.id)}
                    disabled={existingAgentIds.has(agent.id)}
                    onCheckedChange={(checked) => toggle(setAgentIds, agent.id, checked)}
                    avatar={<ActorAvatar actorType="agent" actorId={agent.id} size="md" profileLink={false} showStatusDot />}
                    name={agent.name}
                    detail={agent.description || t(($) => $.group.agent_fallback)}
                  />
                ))}
              </ParticipantSection>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createGroup.isPending || updateParticipants.isPending}>
            {t(($) => $.group.cancel)}
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || createGroup.isPending || updateParticipants.isPending}>
            {isManaging
              ? updateParticipants.isPending ? t(($) => $.group.saving) : t(($) => $.group.save)
              : createGroup.isPending ? t(($) => $.group.creating) : t(($) => $.group.create)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantSection({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section className="p-2">
      <div className="flex items-center gap-2 px-2 py-1.5 text-caption font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {items.length > 0 ? children : <div className="px-2 py-3 text-caption text-muted-foreground">{empty}</div>}
    </section>
  );
}

function ParticipantRow({
  checked,
  disabled,
  onCheckedChange,
  avatar,
  name,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  avatar: React.ReactNode;
  name: string;
  detail: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover has-[:disabled]:cursor-default">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium">{name}</span>
        <span className="block truncate text-caption text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
