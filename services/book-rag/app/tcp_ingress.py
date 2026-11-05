"""Loopback-published byte relay into an internal Docker network; no payload logs.

Docker 29 does not publish ports for internal-only containers. This separate
stdlib-only process holds no models, credentials or store. It connects only to
the configured runtime's Docker DNS name/8000 within its fixed internal subnet.
"""
import asyncio
import ipaddress
import os
import socket


async def main():
    target = os.environ['BOOK_RAG_TARGET']
    if target not in {'sams-book-rag-10d3', 'sams-book-rag-fixture-10d3'}:
        raise RuntimeError('Invalid ingress target')
    subnet = ipaddress.ip_network(os.environ['BOOK_RAG_INTERNAL_SUBNET'])
    if not subnet.is_private:
        raise RuntimeError('Invalid ingress subnet')
    slots = asyncio.Semaphore(32)

    async def pump(reader, writer):
        while True:
            data = await asyncio.wait_for(reader.read(65536), timeout=30)
            if not data:
                return
            writer.write(data)
            await writer.drain()

    async def handle(reader, writer):
        upstream = None
        tasks = []
        try:
            if slots.locked():
                return
            async with slots:
                addresses = await asyncio.get_running_loop().getaddrinfo(target, 8000, type=socket.SOCK_STREAM)
                peers = [a[4][0] for a in addresses]
                if not peers or any(ipaddress.ip_address(peer) not in subnet for peer in peers):
                    return
                remote, upstream = await asyncio.wait_for(asyncio.open_connection(peers[0], 8000), 3)
                tasks = [asyncio.create_task(pump(reader, upstream)), asyncio.create_task(pump(remote, writer))]
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except Exception:
            pass  # Fixed transport closure, never addresses/headers/body/exception dumps.
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            writer.close()
            if upstream:
                upstream.close()

    server = await asyncio.start_server(handle, '0.0.0.0', 8000, limit=65536)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
