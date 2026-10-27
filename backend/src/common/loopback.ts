/** Windows resolves localhost to IPv6 first. Docker's IPv6 port proxy accepts, then resets the socket. */
export function preferIpv4Loopback(url: string): string {
  return url.replace('://localhost', '://127.0.0.1');
}
