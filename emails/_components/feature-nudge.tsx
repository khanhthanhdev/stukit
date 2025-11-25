import type { Tool } from "@prisma/client"
import { Hr, Text } from "@react-email/components"
import type { Jsonify } from "inngest/helpers/jsonify"

type EmailFeatureNudgeProps = {
  tool?: Tool | Jsonify<Tool>
  showButton?: boolean
}

export const EmailFeatureNudge = ({ tool, showButton }: EmailFeatureNudgeProps) => {
  if (!tool) {
    return null
  }

  return (
    <>
      {showButton && <Hr />}

      <Text>
        {tool.name} is in our review queue. We manually approve and publish a handful of tools each
        week in the order they were submitted.
      </Text>

      <Text>
        There&apos;s nothing else you need to do&mdash;our cron-driven admin workflow will pick it
        up automatically and we&apos;ll email you as soon as {tool.name} is scheduled or needs more
        info. Just reply to this email if you have an update.
      </Text>
    </>
  )
}
