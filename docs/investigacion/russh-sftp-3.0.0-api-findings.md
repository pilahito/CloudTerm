# russh-sftp 3.0.0 — exact API findings (read from vendored source)

Source: `~/.cargo/registry/src/<registro>/russh-sftp-3.0.0/`
Files read: `Cargo.toml`, `Cargo.toml.orig`, `README.md`, `src/lib.rs`, `src/error.rs`, `src/buf.rs`,
`src/de.rs`, `src/ser.rs`, `src/extensions.rs`, `src/utils.rs`, `src/client/{mod,error,handler,rawsession,runtime,session}.rs`,
`src/client/fs/{mod,dir,file}.rs`, every `src/protocol/*.rs`, `src/server/{mod,handler,reply}.rs`,
`examples/client.rs`, `examples/server.rs`, `benches/upload_benchmark.rs`, `.github/workflows/ci.yml`.

There is **no `tests/` directory** in the published crate (only `benches/upload_benchmark.rs`, which CI builds
via `cargo clippy --all-targets`; it is the second real-usage reference besides `examples/client.rs`).
README has no usage code beyond links to the two examples.

Everything below was additionally **compile-verified**: I built a scratch crate against the vendored
`russh-sftp 3.0.0` + `russh 0.63.3` (offline) exercising every call listed, including
`channel.into_stream()` and the trait assertions. It compile-checks clean.

---

## 0. Crate facts (Cargo.toml)

- `edition = "2021"`, lib name `russh_sftp`.
- Features: **only one** — `async-trait = ["dep:async-trait"]`, **not default**. No `russh` feature.
- Normal deps: `bitflags` (serde), `bytes`, `chrono`, `dashmap`, `log`, `serde` (derive), `serde_bytes`,
  `thiserror`, `tokio` (io-util, rt, sync, time, macros; no default features), `tokio-util` (rt).
- **`russh` is a dev-dependency only (0.63.2 in the lockfile; 0.63.3 is what is vendored here).** No russh types
  appear anywhere in `src/`. All integration is through tokio's `AsyncRead`/`AsyncWrite`.

---

## 1. Public API surface (exact paths)

```rust
// crate root (src/lib.rs)
pub mod client;
pub mod de;
pub mod extensions;
pub mod protocol;
pub mod ser;
pub mod server;          // #[cfg(not(target_arch = "wasm32"))]
// mod error;  <-- PRIVATE (see §7)
// mod buf; mod utils;  <-- private

// russh_sftp::client
pub use handler::Handler;          // russh_sftp::client::Handler
pub use rawsession::RawSftpSession;// russh_sftp::client::RawSftpSession
pub use session::SftpSession;      // russh_sftp::client::SftpSession   <-- THE high-level type
pub struct Config { .. }           // russh_sftp::client::Config
pub mod error;                     // russh_sftp::client::error::Error
pub mod fs;                        // russh_sftp::client::fs
pub mod rawsession;                // russh_sftp::client::rawsession::{SftpResult, Limits}
pub fn run<S, H>(stream: S, handler: H) -> tokio::sync::mpsc::UnboundedSender<bytes::Bytes>;

// russh_sftp::client::fs
pub use dir::{DirEntry, ReadDir};
pub use file::File;
pub type Metadata = FileAttributes;   // <-- Metadata IS FileAttributes (type alias)

// russh_sftp::protocol
pub use ... FileAttr, FileAttributes, FileMode, FilePermissionFlags, FilePermissions, FileType,
            OpenFlags, Status, StatusCode, Name, File, Packet, Attrs, Data, Handle, Version, ... ;
pub const VERSION: u32 = 3;
```

So yes: **`russh_sftp::client::SftpSession`** is the high-level session; `russh_sftp::client::RawSftpSession`
is the low-level request/response layer; `russh_sftp::protocol::FileAttributes` is re-exported at
`russh_sftp::client::fs::Metadata` too.

`client::Config` (all fields `pub`, `Clone + Debug + Default`):

```rust
pub struct Config {
    pub max_packet_len: u32,        // default 262_144
    pub max_concurrent_reads: usize,// default 16
    pub max_concurrent_writes: usize,// default 16
    pub max_write_packet_len: u32,  // default 32_768
    pub request_timeout_secs: u64,  // default 10
}
```

---

## 2. Constructing a session from an existing SSH channel

Exact constructors (`src/client/session.rs:38-54`):

```rust
impl SftpSession {
    pub async fn new<S>(stream: S) -> SftpResult<Self>
    where S: AsyncRead + AsyncWrite + Unpin + Send + 'static;

    pub async fn new_with_config<S>(stream: S, cfg: Config) -> SftpResult<Self>
    where S: AsyncRead + AsyncWrite + Unpin + Send + 'static;
}
```

- `AsyncRead`/`AsyncWrite` are **`tokio::io::AsyncRead` / `tokio::io::AsyncWrite`** (not futures-io).
- There is **no custom stream trait** of its own. The only requirement is `tokio::io::{AsyncRead, AsyncWrite}
  + Unpin + Send + 'static`. `SftpSession::new` is `async` and does the `SSH_FXP_INIT`/`VERSION` handshake plus
  extension probing (`limits@openssh.com`, etc.) before returning.
- `SftpResult<T> = Result<T, russh_sftp::client::error::Error>` (alias `russh_sftp::client::rawsession::SftpResult`).
- It takes the stream **by value**, and internally `client::run()` does `tokio::io::split(stream)` and
  `tokio::spawn`s a reader task and a writer task (tokio runtime required).

Low-level alternative (`src/client/rawsession.rs:201-226`) — **not async**, you must call `init()` yourself:

```rust
impl RawSftpSession {
    pub fn new<S>(stream: S) -> Self
    where S: AsyncRead + AsyncWrite + Unpin + Send + 'static;
    pub fn new_with_config<S>(stream: S, cfg: Config) -> Self where ...;
    pub async fn init(&self) -> SftpResult<Version>;
}
pub fn run<S, H>(stream: S, handler: H) -> mpsc::UnboundedSender<Bytes>
where S: AsyncRead + AsyncWrite + Unpin + Send + 'static, H: Handler + Send + 'static;
```

---

## 3. Glue for `russh::Channel` — is there any?

**No glue exists inside russh-sftp 3.0.0.** Nothing in `src/` mentions russh. The crate expects the *SSH library*
to hand it an `AsyncRead + AsyncWrite`. With russh 0.63.x the glue is already in russh and **you do not need to
write an adapter**:

```rust
// russh 0.63.3: russh::Channel<S>::into_stream(self) -> russh::ChannelStream<S>
//   (re-exported at the crate root: `pub use channels::{Channel, ChannelMsg, ChannelStream, ...}`)
// ChannelStream<S>: tokio::io::AsyncRead + tokio::io::AsyncWrite  (and Unpin/Send for S = client::Msg)
```

Exact real usage from `examples/client.rs:48-50` (and `benches/upload_benchmark.rs:50-52`):

```rust
let channel = session.channel_open_session().await.unwrap(); // Handle<H>::channel_open_session(&self)
channel.request_subsystem(true, "sftp").await.unwrap();      // Channel::request_subsystem(&self,..)
let sftp = SftpSession::new(channel.into_stream()).await.unwrap();
```

Notes:
- `into_stream(self)` **consumes** the `Channel`. `Channel` is not `Clone`. Keep the `russh::client::Handle<H>`
  alive for the whole SFTP session lifetime.
- Verified compile-typed as `russh::ChannelStream<russh::client::Msg>`.
- `request_subsystem(true, "sftp")` in russh 0.63.3 only sends the request (it forwards to the write half and
  does not await `CHANNEL_SUCCESS`). A `ChannelMsg::Success` that then arrives is silently consumed/skipped by
  `ChannelRx::poll_read` (its `_ =>` arm), so it will not corrupt the SFTP byte stream. The SFTP `INIT`/`VERSION`
  handshake is what actually proves the subsystem is up; if the server rejects it you get a timeout/EOF.
- **Adapter case:** only if you are not on russh 0.63.x (or your channel type has no `into_stream`). Then you must
  write a wrapper satisfying `tokio::io::AsyncRead + AsyncWrite + Unpin + Send + 'static`, i.e. implement
  `poll_read(&mut self, cx, buf: &mut tokio::io::ReadBuf<'_>) -> Poll<io::Result<()>>`,
  `poll_write(&mut self, cx, buf: &[u8]) -> Poll<io::Result<usize>>`, `poll_flush`, `poll_shutdown`.
  russh-sftp specifies **no trait of its own** to implement. (Its `client::Handler` trait is unrelated: it is
  the packet handler used by `client::run(...)`, not a stream adapter.)

---

## 4. Exact method signatures

### High level — `russh_sftp::client::SftpSession` (`&self` methods, all `async`)

```rust
pub async fn open<T: Into<String>>(&self, filename: T) -> SftpResult<File>;                  // READ
pub async fn create<T: Into<String>>(&self, filename: T) -> SftpResult<File>;                // CREATE|TRUNCATE|WRITE
pub async fn open_with_flags<T: Into<String>>(&self, filename: T, flags: OpenFlags) -> SftpResult<File>;
pub async fn open_with_flags_and_attributes<T: Into<String>>(
    &self, filename: T, flags: OpenFlags, attributes: FileAttributes) -> SftpResult<File>;

pub async fn create_dir<T: Into<String>>(&self, path: T) -> SftpResult<()>;                  // mkdir
pub async fn remove_file<T: Into<String>>(&self, filename: T) -> SftpResult<()>;             // unlink
pub async fn remove_dir<P: Into<String>>(&self, path: P) -> SftpResult<()>;                  // rmdir
pub async fn rename<O: Into<String>, N: Into<String>>(&self, oldpath: O, newpath: N) -> SftpResult<()>;

pub async fn read_dir<P: Into<String>>(&self, path: P) -> SftpResult<ReadDir>;
pub async fn metadata<P: Into<String>>(&self, path: P) -> SftpResult<Metadata>;              // stat (follows links)
pub async fn symlink_metadata<P: Into<String>>(&self, path: P) -> SftpResult<Metadata>;      // lstat
pub async fn set_metadata<P: Into<String>>(&self, path: P, metadata: Metadata) -> Result<(), Error>;

pub async fn canonicalize<T: Into<String>>(&self, path: T) -> SftpResult<String>;            // realpath
pub async fn read_link<P: Into<String>>(&self, path: P) -> SftpResult<String>;
pub async fn symlink<P: Into<String>, T: Into<String>>(&self, path: P, target: T) -> SftpResult<()>;
pub async fn read<P: Into<String>>(&self, path: P) -> SftpResult<Vec<u8>>;                   // open+read_to_end+close
pub async fn write<P: Into<String>>(&self, path: P, data: &[u8]) -> SftpResult<()>;          // see gotcha §8
pub async fn try_exists<P: Into<String>>(&self, path: P) -> SftpResult<bool>;
pub async fn hardlink<O: Into<String>, N: Into<String>>(&self, oldpath: O, newpath: N) -> SftpResult<bool>;
pub async fn fs_info<P: Into<String>>(&self, path: P) -> SftpResult<Option<Statvfs>>;
pub async fn expand_path<P: Into<String>>(&self, path: P) -> SftpResult<Option<String>>;
pub fn set_timeout(&self, secs: u64);
pub async fn close(&self) -> SftpResult<()>;
```

`Error` in `set_metadata` is `russh_sftp::client::error::Error` (same as `SftpResult`'s error); it is just spelled
out explicitly there.

All path parameters are `Into<String>` — `&str` and `String` work; **`PathBuf` does not** (`PathBuf: Into<String>`
is not implemented). Convert with `path.to_string_lossy().into_owned()` / `display().to_string()`.

### `russh_sftp::client::fs::File`

```rust
pub async fn metadata(&self) -> SftpResult<Metadata>;            // fstat on the open handle
pub async fn set_metadata(&self, metadata: Metadata) -> SftpResult<()>; // fsetstat
pub async fn sync_all(&self) -> SftpResult<()>;                  // no-op Ok(()) if no fsync@openssh.com
pub async fn close(self) -> std::io::Result<()>;                 // consumes self; == AsyncWriteExt::shutdown
impl tokio::io::AsyncRead for File;
impl tokio::io::AsyncWrite for File;
impl tokio::io::AsyncSeek for File;
impl Drop for File;  // if not closed: fire-and-forget Close packet, reply NOT awaited
```

Use `tokio::io::{AsyncReadExt, AsyncWriteExt, AsyncSeekExt}` for `read`, `read_to_end`, `read_exact`,
`write_all`, `flush`, `shutdown`, `seek`, `rewind`, `stream_position`.

### Low level — `russh_sftp::client::RawSftpSession` (all `async`, `&self` unless noted)

```rust
pub fn new<S>(stream: S) -> Self;  pub fn new_with_config<S>(stream: S, cfg: Config) -> Self;  // NOT async
pub async fn init(&self) -> SftpResult<Version>;
pub fn close_session(&self) -> SftpResult<()>;   pub fn set_timeout(&self, secs: u64);
pub fn set_limits(&mut self, limits: Limits);
pub async fn open<T: Into<String>>(&self, filename: T, flags: OpenFlags, attrs: FileAttributes) -> SftpResult<Handle>;
pub async fn close<H: Into<String>>(&self, handle: H) -> SftpResult<Status>;
pub async fn read<H: Into<String>>(&self, handle: H, offset: u64, len: u32) -> SftpResult<Data>;
pub async fn write<H: Into<String>>(&self, handle: H, offset: u64, data: Vec<u8>) -> SftpResult<Status>;
pub async fn lstat<P: Into<String>>(&self, path: P) -> SftpResult<Attrs>;
pub async fn fstat<H: Into<String>>(&self, handle: H) -> SftpResult<Attrs>;
pub async fn stat<P: Into<String>>(&self, path: P) -> SftpResult<Attrs>;
pub async fn setstat<P: Into<String>>(&self, path: P, attrs: FileAttributes) -> SftpResult<Status>;
pub async fn fsetstat<H: Into<String>>(&self, handle: H, attrs: FileAttributes) -> SftpResult<Status>;
pub async fn opendir<P: Into<String>>(&self, path: P) -> SftpResult<Handle>;
pub async fn readdir<H: Into<String>>(&self, handle: H) -> SftpResult<Name>;
pub async fn remove<T: Into<String>>(&self, filename: T) -> SftpResult<Status>;
pub async fn mkdir<P: Into<String>>(&self, path: P, attrs: FileAttributes) -> SftpResult<Status>;
pub async fn rmdir<P: Into<String>>(&self, path: P) -> SftpResult<Status>;
pub async fn realpath<P: Into<String>>(&self, path: P) -> SftpResult<Name>;
pub async fn rename<O: Into<String>, N: Into<String>>(&self, oldpath: O, newpath: N) -> SftpResult<Status>;
pub async fn readlink<P: Into<String>>(&self, path: P) -> SftpResult<Name>;
pub async fn symlink<P: Into<String>, T: Into<String>>(&self, path: P, target: T) -> SftpResult<Status>;
pub async fn extended<R: Into<String>>(&self, request: R, data: Vec<u8>) -> SftpResult<Packet>;
pub async fn limits(&self) -> SftpResult<LimitsExtension>;
pub async fn hardlink<O, N>(...) -> SftpResult<Status>;   pub async fn fsync<H: Into<String>>(&self, handle: H) -> SftpResult<Status>;
pub async fn statvfs<P: Into<String>>(&self, path: P) -> SftpResult<Statvfs>;
pub async fn expand_path<P: Into<String>>(&self, path: P) -> SftpResult<Name>;
impl Drop for RawSftpSession;  // calls close_session()
```

Packet payload types: `Handle { id: u32, handle: String }`, `Data { id: u32, data: Vec<u8> }`,
`Name { id: u32, files: Vec<File> }`, `Attrs { id: u32, attrs: FileAttributes }`,
`Status { id: u32, status_code: StatusCode, error_message: String, language_tag: String }`,
`File { filename: String, longname: String, attrs: FileAttributes }`.

### `OpenFlags` (bitflags, `russh_sftp::protocol::OpenFlags`)

`READ = 0x01`, `WRITE = 0x02`, `APPEND = 0x04`, `CREATE = 0x08`, `TRUNCATE = 0x10`, `EXCLUDE = 0x20`.
Combine with `|`. `FileAttributes::empty()` exists for "no attrs".

---

## 5. Entry / attribute types

`Metadata` is a **type alias** for `FileAttributes` (`src/client/fs/mod.rs:13`). Exact definition
(`src/protocol/file_attrs.rs:192-202`):

```rust
#[derive(Debug, Default, Clone)]
pub struct FileAttributes {
    pub size: Option<u64>,        // bytes
    pub uid: Option<u32>,
    pub user: Option<String>,
    pub gid: Option<u32>,
    pub group: Option<String>,
    pub permissions: Option<u32>, // full unix mode bits incl. file type (e.g. 0o100644)
    pub atime: Option<u32>,       // seconds since Unix epoch
    pub mtime: Option<u32>,       // seconds since Unix epoch
}
```

Read it with:
- size: `md.size` (`Option<u64>`) or `md.len() -> u64` (0 when `None`).
- mtime: `md.mtime` (`Option<u32>`) or `md.modified() -> std::io::Result<SystemTime>` (returns
  `Err(ErrorKind::InvalidData)` when `mtime` is `None`). atime likewise via `md.accessed()`.
- is_dir: `md.is_dir() -> bool` (checks the `FileMode::DIR` bit `0o40000` inside `permissions`). Also
  `is_regular()`, `is_symlink()`, `is_character()`, `is_block()`, `is_fifo()`.
- type: `md.file_type() -> FileType` where `enum FileType { Dir, File, Symlink, Other }` with
  `is_dir()/is_file()/is_symlink()/is_other()`.
- permissions: `md.permissions() -> FilePermissions` (9 `pub bool`s: `owner_read/owner_write/owner_exec`,
  `group_*`, **`other_*`** — note the odd field order in the struct; `is_readonly()`, `set_readonly()`,
  `Display` renders `rwxrwxrwx`).
- `FileAttributes::empty()` (= `Default`), `FileAttributes::dummy()` (used for symlink/realpath packets).

`DirEntry` (`src/client/fs/dir.rs`, fields private, only getters):

```rust
pub struct DirEntry { /* parent: Arc<str>, file: String, metadata: FileAttributes */ }
pub fn file_name(&self) -> String;          // owned String, not &str
pub fn file_type(&self) -> FileType;
pub fn metadata(&self) -> Metadata;         // clone of the attrs from the readdir NAME packet
pub fn path(&self) -> String;               // joins the path passed to read_dir with file_name via '/'
```

---

## 6. `read_dir` semantics

```rust
pub async fn read_dir<P: Into<String>>(&self, path: P) -> SftpResult<ReadDir>;
```

It is **`async` and returns a plain, synchronous `std::iter::Iterator`, not a `Stream`**. Implementation
(`session.rs:180-208`) does all network I/O inside the `async fn`: `opendir`, then loops `readdir` until the
server answers `StatusCode::Eof`, then sends `close(handle)`. The result is a fully materialized
`VecDeque<(String, Metadata)>` wrapped in `ReadDir`.

Consume it with an ordinary `for` loop — **no `.next().await`, no `StreamExt`**:

```rust
for entry in sftp.read_dir("/var/log").await? {   // NOTE: no .await on the loop
    let name: String = entry.file_name();
    let full: String = entry.path();
    let md = entry.metadata();
    if md.is_dir() { /* ... */ }
}
let entries: Vec<DirEntry> = sftp.read_dir(".").await?.collect();
```

`ReadDir::next()` transparently skips `"."` and `".."`. Because everything is buffered, memory grows with the
directory size and the first entry is only available after the whole directory has been fetched.

---

## 7. Error types

There are two distinct `Error` types with the same name:

1. **`russh_sftp::client::error::Error`** — this is the one all `SftpResult<T>` use, and the only publicly
   *nameable* error type (`pub mod error;` inside `pub mod client`). `Debug + Clone + thiserror::Error`:

```rust
pub enum Error {
    Status(Status),                 // remote SSH_FXP_STATUS failure; .0.status_code, .0.error_message
    IO(String),
    Timeout,                        // request exceeded request_timeout_secs
    Limited(String),                // limits@openssh.com exceeded
    UnexpectedPacket,
    UnexpectedBehavior(String),
}
impl From<Status> for Error;
impl From<std::io::Error> for Error;             // ErrorKind::TimedOut -> Error::Timeout
impl<T> From<tokio::sync::mpsc::error::SendError<T>> for Error;
impl From<tokio::sync::oneshot::error::RecvError> for Error;
impl From<crate::error::Error> for Error;        // wraps the private root error
impl From<Error> for std::io::Error;             // Timeout -> ErrorKind::TimedOut, else Other
```

2. **`russh_sftp::error::Error`** — a separate `enum Error { IO(String), UnexpectedEof, BadMessage(String),
   Client(String), UnexpectedBehavior(String) }` used by `de`/`ser`/`protocol`/server, **but its module is
   private in `lib.rs` (`mod error;`), so it is NOT reachable by path**. Do not try to name
   `russh_sftp::error::Error`; it will not compile. `client::error::Error` is the public error type.

`ser::to_bytes` / `de::from_bytes` return `Result<_, russh_sftp::error::Error>` (unnameable); if you call them,
handle with `.unwrap()`/`map_err` + `Display`, or convert through `?` into something that takes `impl Error`.

`StatusCode` (`russh_sftp::protocol::StatusCode`, `Copy + PartialEq`): `Ok=0, Eof=1, NoSuchFile=2,
PermissionDenied=3, Failure=4, BadMessage=5, NoConnection=6, ConnectionLost=7, OpUnsupported=8`.
Match `Error::Status(s) if s.status_code == StatusCode::NoSuchFile` for "does not exist".

---

## 8. Gotchas: timeouts, `close()`, lifetime/keep-alive

- **Default timeout is 10 s per request** (`Config::request_timeout_secs`). Change it with
  `sftp.set_timeout(secs)` (or `Config { request_timeout_secs, .. }` + `new_with_config`). This is easy to hit
  on slow links / big uploads; raise it for real transfers.
- The deadline is computed **when the packet is sent**, not when the future is first awaited (`rawsession.rs:255`,
  `runtime.rs:72`). `File` read/write pre-queues up to `max_concurrent_reads`/`max_concurrent_writes` (16) requests,
  so a stalled server can make queued requests fail with `Error::Timeout`.
- `SftpSession::close(&self) -> SftpResult<()>` does **not** wait for a reply and the method is mostly a
  fire-and-forget: it pushes an empty buffer that makes `client::run`'s writer task call
  `AsyncWriteExt::shutdown()`. On a russh `ChannelStream` that shutdown sends `ChannelMsg::Eof`; the SSH channel
  itself is closed only when the stream/`Channel` is dropped. `RawSftpSession::drop` also calls `close_session()`,
  and the stream tasks self-cancel when the transport ends.
- `File::close(self) -> io::Result<()>` consumes the file and waits for pending writes + remote ack. If you just
  drop a `File`, the handle is closed fire-and-forget and **write errors / close status are silently discarded**
  (`file.rs:272-280`). Always call `file.close()` (or `shutdown()`) for uploads.
- **Keep-alive:** the spawned reader/writer tasks own the stream. `SftpSession` holds an `Arc<RawSftpSession>`;
  dropping the last `SftpSession` triggers `close_session()` (EOF). You must keep the `russh::client::Handle`
  (the SSH session) alive while the `SftpSession` is in use — dropping the handle tears down the connection and
  every subsequent SFTP call fails (`Error::UnexpectedBehavior("session closed")` / EOF / timeout).
  `SftpSession` is **not `Clone`** (verified: no `Clone` impl); it *is* `Send + Sync`, and `File` is `Send`
  (verified by trait assertions and by the shipped bench spawning `File` into `tokio::task::spawn`). Share it as
  `&SftpSession` / `Arc<SftpSession>` if you need it in several tasks.
- `SftpSession::new` internally `tokio::spawn`s — it must run inside a tokio runtime with time enabled
  (russh-sftp enables tokio `rt`, `time`, `io-util`, `sync` itself; feature unification covers your crate).
  Tauri v2 async commands run on tokio, so this is normally fine.
- **`SftpSession::write(path, data)` bug/limitation:** it opens with `OpenFlags::WRITE` **only** — no `CREATE`,
  no `TRUNCATE`. It fails with `NoSuchFile` if the file doesn't exist and does not truncate an existing file.
  For uploads use `sftp.create(path)` (CREATE|TRUNCATE|WRITE) or `open_with_flags(...)`, then `write_all` +
  `close()`.
- `SftpSession::read(path)` does open + `read_to_end` + `close`; fine for downloads but loads everything into
  memory. For large files use `open()` + `tokio::io::copy` (or a manual chunk loop).
- `File::seek(SeekFrom::End(_))` costs an extra `fstat` round-trip; `rewind()`/`SeekFrom::Start` are cheap.
- `read_dir`'s `DirEntry::metadata()` comes from the directory-listing `NAME` packet, which may have `size`/
  `mtime` unset (→ `len() == 0`, `modified() == Err`). Use `sftp.metadata(entry.path())` for authoritative stats.
- On a non-`Eof` error, `read_dir` returns early without closing the dir handle (minor handle leak).
- `SftpSession::read_dir` is the only listing API; there is no `read_dir`-stream and no watch/notify.
- `SftpSession::metadata` = `stat` (follows symlinks); `symlink_metadata` = `lstat`. `set_metadata` sets the
  whole `FileAttributes` (only `Some` fields are sent on the wire).
- `OpenFlags::EXCLUDE` maps to `create_new` semantics and, per SFTPv3 spec, requires `CREATE` to be set too.
- Timestamps are `u32` seconds (year-2106 limit); `FileAttributes::modified()` builds `UNIX_EPOCH + secs`.

---

## 9. Upload / download helpers?

**No.** There is no `upload`, `download`, `put`, `get`, or copy helper anywhere in `src/` (grep confirms; only the
bench file names mention "upload"). Transfers are manual loops over the high-level `File` (which implements
`AsyncRead`/`AsyncWrite`/`AsyncSeek`) or over `RawSftpSession::read`/`write`.

Upload (exact, compiles):

```rust
use russh_sftp::protocol::OpenFlags;
use tokio::io::AsyncWriteExt;

let mut file = sftp.create("/remote/dest.bin").await?;   // CREATE|TRUNCATE|WRITE
file.write_all(&data).await?;                            // AsyncWrite (chunked internally,
                                                         // up to max_concurrent_writes in flight)
file.close().await?;                                     // waits for pending writes + remote ack
```

Download:

```rust
use tokio::io::AsyncReadExt; // or tokio::io::copy
let mut file = sftp.open("/remote/src.bin").await?;      // READ
let mut buf = Vec::new();
file.read_to_end(&mut buf).await?;                       // or: tokio::io::copy(&mut file, &mut local)
file.close().await?;
```

("Upload/download helpers" exist in *other* crates/versions only; do not assume them here.)

---

## UNCONFIRMED items

- Nothing in this report is guessed; all signatures/types were read from the vendored 3.0.0 source and the
  usage paths were compile-checked offline against the vendored `russh 0.63.3`.
- UNCONFIRMED: runtime behavior against a live server (I only type-checked, did not connect). Specifically, the
  claim that a `ChannelMsg::Success` from `request_subsystem(true, ...)` is harmlessly skipped is from reading
  russh 0.63.3 `src/channels/io/rx.rs` (`_ =>` arm consumes and returns `Pending`), not from a live run.
- UNCONFIRMED: whether `russh 0.63.2` (the lockfile pin) behaves identically to the vendored 0.63.3 for
  `into_stream`; only 0.63.3 source is present here.
