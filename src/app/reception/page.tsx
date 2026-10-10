/**
 * The reception panel's entry — `02-architecture.md` §7's «میز کار امروز».
 *
 * The desk's own home is `reception/desk`, which is where the panel's work
 * actually is. This route exists so that `/reception` — the path a signed-in
 * person lands on after login, and the path the panel's own home link used to
 * carry — sends them to the desk rather than showing a second, empty home.
 *
 * A `redirect()` on the server, not a client-side navigation, so the entry is
 * one request and one render: the person never sees an empty home flash before
 * the desk appears.
 */

import { redirect } from 'next/navigation'

export default function ReceptionHomePage() {
  redirect('/reception/desk')
}