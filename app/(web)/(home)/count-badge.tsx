import { formatNumber } from "@curiousleaf/utils"
import { subDays } from "date-fns"
import Link from "next/link"
import plur from "plur"
import { Badge } from "~/components/web/ui/badge"
import { Ping } from "~/components/web/ui/ping"
import { countTools } from "~/server/tools/queries"

export const CountBadge = async () => {
  const [toolsCount, newToolsCount] = await Promise.all([
    countTools({ where: { publishedAt: { lte: new Date() } } }),
    countTools({ where: { publishedAt: { lte: new Date(), gte: subDays(new Date(), 7) } } }),
  ])

  return (
    <Badge size="lg" prefix={<Ping />} className="order-first" asChild>
      <Link href="/tools?sort=publishedAt.desc">
        {newToolsCount
          ? `${formatNumber(newToolsCount)} new ${plur("tool", newToolsCount)} added`
          : `${formatNumber(toolsCount)}+ tools collected`}
      </Link>
    </Badge>
  )
}
