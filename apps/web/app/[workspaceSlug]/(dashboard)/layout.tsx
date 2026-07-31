"use client";

import { DashboardLayout } from "@silieco/views/layout";
import { SiliecoIcon } from "@silieco/ui/components/common/silieco-icon";
import { SearchCommand, SearchTrigger } from "@silieco/views/search";
import { FloatingChat } from "@silieco/views/chat";
import { WebNotificationBridge } from "@/components/web-notification-bridge";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<SiliecoIcon className="size-6" />}
      searchSlot={<SearchTrigger />}
      extra={
        <>
          <SearchCommand />
          <WebNotificationBridge />
          <FloatingChat />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
