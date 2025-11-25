"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import type { HTMLAttributes } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"
import { useServerAction } from "zsa-react"
import { submitTool } from "~/actions/submit"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/common/form"
import { Button } from "~/components/web/ui/button"
import { Input } from "~/components/web/ui/input"
import { submitToolSchema } from "~/server/schemas"
import { cx } from "~/utils/cva"

export const SubmitForm = ({ className, ...props }: HTMLAttributes<HTMLFormElement>) => {
  const router = useRouter()

  const form = useForm<z.infer<typeof submitToolSchema>>({
    resolver: zodResolver(submitToolSchema),
    defaultValues: {
      name: "",
      websiteUrl: "",
      submitterName: "",
      submitterEmail: "",
    },
  })

  const { execute, isPending } = useServerAction(submitTool, {
    onSuccess: ({ data }) => {
      form.reset()

      if (data.publishedAt && data.publishedAt <= new Date()) {
        toast.info(`${data.name} is already live on ${window.location.host}.`)
        router.push(`/tools/${data.slug}`)
      } else {
        toast.success(`${data.name} has been added to the review queue.`)
        router.push(`/submit/${data.slug}?success=true`)
      }
    },

    onError: ({ err }) => {
      toast.error(err.message)
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(data => execute(data))}
        className={cx("grid w-full gap-5 sm:grid-cols-2", className)}
        noValidate
        {...props}
      >
        <FormField
          control={form.control}
          name="submitterName"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Your Name:</FormLabel>
              <FormControl>
                <Input size="lg" placeholder="John Doe" data-1p-ignore {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="submitterEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Your Email:</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  size="lg"
                  placeholder="john@doe.com"
                  data-1p-ignore
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Name:</FormLabel>
              <FormControl>
                <Input size="lg" placeholder="Acme Analytics" data-1p-ignore {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="websiteUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Website URL:</FormLabel>
              <FormControl>
                <Input type="url" size="lg" placeholder="https://acmeanalytics.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="col-span-full">
          <Button
            variant="primary"
            isPending={isPending}
            disabled={isPending}
            className="flex min-w-32"
          >
            Submit
          </Button>
        </div>
      </form>
    </Form>
  )
}
