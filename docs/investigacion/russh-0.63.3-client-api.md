# russh 0.63.3 — verified client API reference

Source read: `~/.cargo/registry/src/<registro>/russh-0.63.3/`
(`Cargo.toml`, `src/lib.rs`, `src/lib_inner.rs`, `src/client/mod.rs`, `src/client/session.rs`,
`src/keys/mod.rs`, `src/keys/key.rs`, `src/keys/format/mod.rs`, `src/cert.rs`,
`src/channels/mod.rs`, `src/pty.rs`, `src/auth.rs`, `src/negotiation.rs`,
`examples/client_exec_simple.rs`, `examples/client_exec_interactive.rs`).

Everything below was also **compile-checked** with rustc 1.98.1 against russh 0.63.3 with
**default features** (`flate2`, `aws-lc-rs`, `rsa`). The full example in §10 builds with zero
errors. Negative claims (private `pty` module, missing `wait_close`) were confirmed by
intentionally compiling code that fails.

Crate metadata: `edition = "2024"`, `rust-version = "1.89"`, lib name `russh`.

---

## 0. Module layout / what is re-exported at the crate root

From `src/lib_inner.rs` (included by `src/lib.rs`):

```rust
pub mod client;
pub mod server;          // cfg(not(target_arch = "wasm32"))
pub mod keys;            // keys live INSIDE russh (there is no russh-keys dependency)
pub mod cipher; pub mod compression; pub mod kex; pub mod mac;
pub use negotiation::{Names, Preferred};
pub use pty::Pty;                        // module `pty` itself is PRIVATE
pub use sshbuffer::SshId;
pub use channels::{Channel, ChannelMsg, ChannelReadHalf, ChannelStream, ChannelWriteHalf};
pub use auth::{AgentAuthError, GssapiAuthenticator, GssapiError, GssapiStep,
               MethodKind, MethodSet, Signer};
pub use russh_cryptovec::CryptoVec;
```

Important root-level facts:

- `russh::Error` is the crate error enum (`src/lib_inner.rs`).
- `russh::Pty` **exists**; `russh::pty::Pty` **does not** (`mod pty;` is private — verified: `error[E0603]: module 'pty' is private`).
- `russh::client::AuthResult` exists (re-exported in `client/mod.rs`: `pub use crate::auth::AuthResult;`).
  `russh::AuthResult` does **not** exist (`mod auth;` is private).
- `russh::client::Msg` (`pub enum Msg` at `client/mod.rs:151`) and `russh::client::Session` are public.
- `russh::keys` is a normal module of this crate. `Cargo.toml` has **no** `russh-keys` dependency, so there is no `russh_keys` crate re-export. `russh::keys` itself re-exports:
  ```rust
  pub use ssh_key::{self, Algorithm, Certificate, EcdsaCurve, HashAlg, PrivateKey, PublicKey};
  pub use signature; pub use ssh_encoding;
  pub use key::PrivateKeyWithHashAlg;
  pub use format::*;                       // load/decode helpers
  pub use crate::cert::PublicKeyOrCertificate;
  ```
- `russh::client::Handler`, `Config`, `Handle`, `Msg`, `Session`, `connect`, `connect_stream`, `AuthResult`, `DisconnectReason`, `Prompt`, `RemoteDisconnectInfo`, `KeyboardInteractiveAuthResponse` are public.

---

## 1. Exact `use` statements for connect + auth + shell

```rust
use std::sync::Arc;                                  // Config is passed as Arc<Config>
use std::time::Duration;                             // optional config timeouts

use russh::client::{self, Config, Handler};          // client::connect is a free fn in `russh::client`
use russh::keys::PublicKeyOrCertificate;             // required for check_server_key
use russh::{ChannelMsg, Disconnect};                 // root re-exports
// for publickey auth also:
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
```

`use russh::client::Handler;` is only needed to name the trait; `impl client::Handler for X` also works.
The bundled examples use the glob form:

```rust
use russh::keys::*;
use russh::*;
```

---

## 2. The client `Handler` trait

Full path: **`russh::client::Handler`**.

Definition (`src/client/mod.rs:2343-2345`):

```rust
#[cfg_attr(feature = "async-trait", async_trait::async_trait)]
pub trait Handler: Sized + Send {
    type Error: From<crate::Error> + Send + core::fmt::Debug;
    // ... all methods have default bodies ...
}
```

- Required items: **only `type Error`**. Every method has a default implementation.
- `type Error` must satisfy `From<russh::Error> + Send + std::fmt::Debug`.
  Using `type Error = russh::Error;` satisfies this and is what the examples do.
- `Handler: Sized + Send` — **`Sync` is NOT required**. `client::connect` additionally requires
  `H: Handler + Send + 'static`; `Session::run` requires `H: Handler + Send`.

### `check_server_key` — exact signature

```rust
fn check_server_key(
    &mut self,
    server_public_key: &PublicKeyOrCertificate,
) -> impl Future<Output = Result<bool, Self::Error>> + Send;
```

The parameter type is **`&russh::keys::PublicKeyOrCertificate`**, *not* `&ssh_key::PublicKey`.
(The task's guessed signature is wrong on this point.) It is an enum:

```rust
pub enum PublicKeyOrCertificate {
    PublicKey { key: ssh_key::PublicKey, hash_alg: Option<HashAlg> },
    Certificate(ssh_key::Certificate),
}
impl PublicKeyOrCertificate {
    pub fn public_key(&self) -> ssh_key::PublicKey;          // owned clone
    pub fn certificate(&self) -> Option<&ssh_key::Certificate>;
}
```

The default body returns `Ok(false)` (rejects all keys). During initial key exchange, if the
callback returns `Ok(false)` (or a cert callback rejects the cert), `connect()` fails with
`H::Error` built from `russh::Error::UnknownKey` — i.e. with `type Error = russh::Error` you get
`Err(russh::Error::UnknownKey)` from `client::connect`. So you must override it to connect at all.

Implement it as a plain `async fn` (see §9 for the `async-trait` note):

```rust
impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(true) // accept any server key
    }
}
```

### Complete method list (all defaulted; exact signatures)

```rust
fn auth_banner(&mut self, banner: &str, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;                       // default Ok(())

fn check_server_key(&mut self, server_public_key: &PublicKeyOrCertificate)
    -> impl Future<Output = Result<bool, Self::Error>> + Send;                     // default Ok(false)

fn kex_done(&mut self, shared_secret: Option<&[u8]>, names: &negotiation::Names, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;

fn channel_open_confirmation(&mut self, id: ChannelId, max_packet_size: u32, window_size: u32,
                             session: &mut Session) -> impl Future<Output = Result<(), Self::Error>> + Send;
fn channel_success(&mut self, channel: ChannelId, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn channel_failure(&mut self, channel: ChannelId, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn channel_close(&mut self, channel: ChannelId, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn channel_eof(&mut self, channel: ChannelId, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn channel_open_failure(&mut self, channel: ChannelId, reason: ChannelOpenFailure,
                        description: &str, language: &str, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;

fn server_channel_open_forwarded_tcpip(&mut self, channel: Channel<Msg>,
    connected_address: &str, connected_port: u32, originator_address: &str,
    originator_port: u32, reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_forwarded_streamlocal(&mut self, channel: Channel<Msg>,
    socket_path: &str, reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_agent_forward(&mut self, channel: Channel<Msg>,
    reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn should_accept_unknown_server_channel(&mut self, id: ChannelId, channel_type: &str)
    -> impl Future<Output = bool> + Send;                                          // default false
fn server_channel_open_unknown(&mut self, channel: Channel<Msg>,
    reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_session(&mut self, channel: Channel<Msg>,
    reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_direct_tcpip(&mut self, channel: Channel<Msg>,
    host_to_connect: &str, port_to_connect: u32, originator_address: &str,
    originator_port: u32, reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_direct_streamlocal(&mut self, channel: Channel<Msg>,
    socket_path: &str, reply: ChannelOpenHandle, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn server_channel_open_x11(&mut self, channel: Channel<Msg>,
    originator_address: &str, originator_port: u32, reply: ChannelOpenHandle,
    session: &mut Session) -> impl Future<Output = Result<(), Self::Error>> + Send;

fn data(&mut self, channel: ChannelId, data: &[u8], session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn extended_data(&mut self, channel: ChannelId, ext: u32, data: &[u8], session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn xon_xoff(&mut self, channel: ChannelId, client_can_do: bool, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn exit_status(&mut self, channel: ChannelId, exit_status: u32, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn exit_signal(&mut self, channel: ChannelId, signal_name: Sig, core_dumped: bool,
    error_message: &str, lang_tag: &str, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn window_adjusted(&mut self, channel: ChannelId, new_size: u32, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn adjust_window(&mut self, channel: ChannelId, window: u32) -> u32;               // default: window

fn openssh_ext_host_keys_announced(&mut self, keys: Vec<PublicKey>, session: &mut Session)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
fn disconnected(&mut self, reason: DisconnectReason<Self::Error>)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
```

Here `Session` = `russh::client::Session`, `Msg` = `russh::client::Msg`,
`ChannelOpenHandle = russh::client::ChannelOpenHandle` (a type alias for
`russh::ChannelOpenHandleInner<Msg>`), `ChannelId`/`ChannelOpenFailure`/`Sig`/`Disconnect` are
crate-root types, and `PublicKey` in `openssh_ext_host_keys_announced` is `ssh_key::PublicKey`.

---

## 3. `russh::client::Config`

`pub struct Config` (`src/client/mod.rs:2284`). It is **not** `#[non_exhaustive]`, has a
`Default` impl, and is public-fielded, so both struct-literal-with-`..Default::default()` and a
full literal work. Fields:

```rust
pub struct Config {
    pub client_id: SshId,                              // default: SshId::Standard("SSH-2.0-russh_0.63.3")
    pub limits: Limits,                                // rekey byte/time limits
    pub window_size: u32,                              // default 2_097_152
    pub maximum_packet_size: u32,                      // default 32_768
    pub channel_buffer_size: usize,                    // default 100
    pub preferred: negotiation::Preferred,             // algorithm preference lists
    pub inactivity_timeout: Option<std::time::Duration>,   // default None
    pub keepalive_interval: Option<std::time::Duration>,   // default None
    pub keepalive_max: usize,                          // default 3
    pub anonymous: bool,                               // default false
    pub gex: GexParams,                                // DH group-exchange params
    pub nodelay: bool,                                 // default false; set_nodelay(true) if true
}
```

Build it like this (this exact code compiled):

```rust
use std::sync::Arc;
use std::time::Duration;
use russh::client::Config;

let config = Arc::new(Config {
    inactivity_timeout: Some(Duration::from_secs(30)),
    keepalive_interval: Some(Duration::from_secs(10)),
    ..Config::default()
});
```

`Preferred` (re-exported at `russh::Preferred`) fields:

```rust
pub struct Preferred {
    pub kex: Cow<'static, [kex::Name]>,
    pub key: Cow<'static, [ssh_key::Algorithm]>,
    pub host_key_certificates: Cow<'static, [ssh_key::Algorithm]>, // empty by default
    pub cipher: Cow<'static, [cipher::Name]>,
    pub mac: Cow<'static, [mac::Name]>,
    pub compression: Cow<'static, [compression::Name]>,
}
```

Examples override `preferred.kex` with `Cow::Owned(vec![russh::kex::CURVE25519_PRE_RFC_8731, russh::kex::EXTENSION_SUPPORT_AS_CLIENT])`.
`limits: Limits` has `Limits::new(write, read, Duration)` and `Default`.

---

## 4. `russh::client::connect`

Exact signature (`src/client/mod.rs:1083`):

```rust
#[cfg(not(target_arch = "wasm32"))]
pub async fn connect<H: Handler + Send + 'static, A: tokio::net::ToSocketAddrs>(
    config: Arc<Config>,
    addrs: A,
    handler: H,
) -> Result<Handle<H>, H::Error>
```

Note: the error type is **`H::Error`**, not `russh::Error` (with `type Error = russh::Error` they
coincide). `config` is `Arc<Config>` (wrap it yourself).

Generic-stream variant (`src/client/mod.rs:1102`):

```rust
pub async fn connect_stream<H, R>(
    config: Arc<Config>,
    stream: R,
    handler: H,
) -> Result<Handle<H>, H::Error>
where
    H: Handler + Send + 'static,
    R: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static;
```

`connect` returns only after the initial key exchange completed, i.e. after
`Handler::check_server_key` has already been called.

---

## 5. `russh::client::Handle<H>`

`pub struct Handle<H: Handler>` (`src/client/mod.rs:299`). Exact methods:

```rust
impl<H: Handler> Handle<H> {
    pub fn is_closed(&self) -> bool;

    pub async fn authenticate_none<U: Into<String>>(
        &mut self, user: U,
    ) -> Result<AuthResult, russh::Error>;

    pub async fn authenticate_password<U: Into<String>, P: Into<String>>(
        &mut self, user: U, password: P,
    ) -> Result<AuthResult, russh::Error>;

    pub async fn authenticate_publickey<U: Into<String>>(
        &mut self, user: U, key: russh::keys::PrivateKeyWithHashAlg,
    ) -> Result<AuthResult, russh::Error>;

    pub async fn authenticate_openssh_cert<U: Into<String>>(
        &mut self, user: U, key: Arc<ssh_key::PrivateKey>, cert: ssh_key::Certificate,
    ) -> Result<AuthResult, russh::Error>;

    pub async fn authenticate_publickey_with<U: Into<String>, S: russh::auth::Signer>( ... ) // `auth` is private; use signer path via keys::agent
    pub async fn best_supported_rsa_hash(&self) -> Result<Option<Option<ssh_key::HashAlg>>, russh::Error>;

    pub async fn channel_open_session(&self) -> Result<Channel<Msg>, russh::Error>;

    pub async fn channel_open_x11<A: Into<String>>(
        &self, originator_address: A, originator_port: u32,
    ) -> Result<Channel<Msg>, russh::Error>;

    pub async fn channel_open_direct_tcpip<A: Into<String>, B: Into<String>>(
        &self, host_to_connect: A, port_to_connect: u32,
        originator_address: B, originator_port: u32,
    ) -> Result<Channel<Msg>, russh::Error>;

    pub async fn channel_open_direct_streamlocal<S: Into<String>>(
        &self, socket_path: S,
    ) -> Result<Channel<Msg>, russh::Error>;

    pub async fn disconnect(
        &self, reason: Disconnect, description: &str, language_tag: &str,
    ) -> Result<(), russh::Error>;

    pub async fn data(&self, id: ChannelId, data: impl Into<bytes::Bytes>)
        -> Result<(), bytes::Bytes>;

    pub async fn rekey_soon(&self) -> Result<(), russh::Error>;
    pub async fn send_keepalive(&self, want_reply: bool) -> Result<(), russh::Error>;
    pub async fn send_ping(&self) -> Result<(), russh::Error>;
    pub async fn no_more_sessions(&self, want_reply: bool) -> Result<(), russh::Error>;
}
```

Notable: **`authenticate_*` take `&mut self`; `channel_open_session` and `disconnect` take
`&self`.** So declare `let mut session = ...` (mutable is needed for authenticate, and it is fine
for the rest).

`AuthResult` (`russh::client::AuthResult`) is:

```rust
pub enum AuthResult { Success, Failure { /* private fields */ } }
impl AuthResult { pub fn success(&self) -> bool; }
```

`best_supported_rsa_hash()` returns `Result<Option<Option<HashAlg>>, _>`; the examples call
`.await?.flatten()` to get `Option<HashAlg>` for `PrivateKeyWithHashAlg::new`.

---

## 6. `russh::Channel<Msg>` (also `russh::ChannelWriteHalf<Msg>`, `ChannelReadHalf`)

`pub struct Channel<Send: From<(ChannelId, ChannelMsg)>>` at `src/channels/mod.rs:448`.
For a client, `Send = russh::client::Msg`; `Handle::channel_open_session` returns
`Channel<Msg>` concretely. Exact signatures:

```rust
// dimensions in cells, then pixels; terminal_modes is a slice, not a struct
pub async fn request_pty(
    &self,
    want_reply: bool,
    term: &str,
    col_width: u32,
    row_height: u32,
    pix_width: u32,
    pix_height: u32,
    terminal_modes: &[(Pty, u32)],
) -> Result<(), russh::Error>;

pub async fn request_shell(&self, want_reply: bool) -> Result<(), russh::Error>;

pub async fn exec<A: Into<Vec<u8>>>(&self, want_reply: bool, command: A)
    -> Result<(), russh::Error>;

// `data` takes an AsyncRead, NOT &[u8]/Bytes/&str
pub async fn data<R: tokio::io::AsyncRead + Unpin>(&self, data: R) -> Result<(), russh::Error>;

// owned-bytes alternative (no AsyncRead copy)
pub async fn data_bytes(&self, data: impl Into<bytes::Bytes>) -> Result<(), russh::Error>;

pub async fn extended_data<R: tokio::io::AsyncRead + Unpin>(&self, ext: u32, data: R)
    -> Result<(), russh::Error>;
pub async fn extended_data_bytes(&self, ext: u32, data: impl Into<bytes::Bytes>)
    -> Result<(), russh::Error>;

pub async fn eof(&self) -> Result<(), russh::Error>;
pub async fn close(&self) -> Result<(), russh::Error>;
pub async fn exit_status(&self, exit_status: u32) -> Result<(), russh::Error>;
pub async fn signal(&self, signal: Sig) -> Result<(), russh::Error>;
pub async fn request_subsystem<A: Into<String>>(&self, want_reply: bool, name: A)
    -> Result<(), russh::Error>;
pub async fn set_env<A: Into<String>, B: Into<String>>(
    &self, want_reply: bool, variable_name: A, variable_value: B) -> Result<(), russh::Error>;

pub async fn window_change(
    &self, col_width: u32, row_height: u32, pix_width: u32, pix_height: u32,
) -> Result<(), russh::Error>;

pub async fn agent_forward(&self, want_reply: bool) -> Result<(), russh::Error>;
pub async fn writable_packet_size(&self) -> usize;
pub fn id(&self) -> ChannelId;

pub async fn wait(&mut self) -> Option<ChannelMsg>;      // NOTE: &mut self, returns Option

pub fn split(self) -> (ChannelReadHalf, ChannelWriteHalf<Msg>);
pub fn into_stream(self) -> ChannelStream<Msg>;
pub fn make_reader(&mut self) -> impl AsyncRead + '_;
pub fn make_reader_ext(&mut self, ext: Option<u32>) -> impl AsyncRead + '_;
pub fn make_writer(&self) -> impl AsyncWrite + 'static;
pub fn make_writer_ext(&self, ext: Option<u32>) -> impl AsyncWrite + 'static;
```

### `wait_close` — DOES NOT EXIST

There is **no `Channel::wait_close`** (nor on `ChannelReadHalf`/`ChannelWriteHalf`). Verified by
compiling `c.wait_close().await`, which fails with
`error[E0599]: no method named 'wait_close' found for mutable reference '&mut russh::Channel<russh::client::Msg>'`.
Use `channel.wait() -> Option<ChannelMsg>` and match `ChannelMsg::Eof` / `ChannelMsg::Close`
(`None` also means the channel is gone). `ChannelMsg` is `#[non_exhaustive]`, so always include a
`_ => {}` arm.

### `Pty` — the pty-request argument type

`terminal_modes: &[(Pty, u32)]` where `Pty` is the **crate-root enum `russh::Pty`**
(`pub use pty::Pty;`), a terminal-control-character / mode-code enum (variants `VINTR`, `ECHO`,
`ICANON`, `TTY_OP_END`, `TTY_OP_ISPEED`, …). It is **not** a struct literal holding dimensions;
the dimensions are the four separate `u32` parameters. `russh::pty::Pty` is inaccessible because
`mod pty;` is private (verified: `error[E0603]: module 'pty' is private`). Pass `&[]` if you don't
care about terminal modes (the bundled examples do):

```rust
channel.request_pty(false, "xterm", 80, 24, 0, 0, &[]).await?;
// or, with explicit modes (this compiled):
channel.request_pty(true, "xterm", 80, 24, 0, 0,
                    &[(russh::Pty::ECHO, 1), (russh::Pty::TTY_OP_END, 0)]).await?;
```

---

## 7. Loading a private key from disk

All key helpers are in **`russh::keys`** (`src/keys/mod.rs`, `src/keys/format/mod.rs`). There is no
`russh_keys` crate.

```rust
pub fn load_secret_key<P: AsRef<Path>>(
    secret_: P,
    password: Option<&str>,
) -> Result<ssh_key::PrivateKey, russh::keys::Error>;

pub fn decode_secret_key(
    secret: &str,
    password: Option<&str>,
) -> Result<ssh_key::PrivateKey, russh::keys::Error>;

pub fn load_public_key<P: AsRef<Path>>(path: P) -> Result<ssh_key::PublicKey, russh::keys::Error>;
pub fn load_openssh_certificate<P: AsRef<Path>>(cert_: P) -> Result<ssh_key::Certificate, ssh_key::Error>;
```

- Return type is `ssh_key::PrivateKey` (`russh::keys::PrivateKey`), **not** `Arc<PrivateKey>` and
  not `PrivateKeyWithHashAlg`.
- A passphrase **is** a parameter: `Some("passphrase")`, or `None` for an unencrypted key.
  The result is `Err(russh::keys::Error::KeyIsEncrypted)` if the key is encrypted and no/wrong
  password is supplied.
- `load_secret_key` is a synchronous (blocking) `std::fs` read.

`authenticate_publickey` takes a **`russh::keys::PrivateKeyWithHashAlg` by value**, not
`Arc<PrivateKey>` and not `&PrivateKey`. You build it from the loaded key:

```rust
pub struct PrivateKeyWithHashAlg { /* private: Arc<PrivateKey>, Option<HashAlg> */ }
impl PrivateKeyWithHashAlg {
    pub fn new(key: Arc<ssh_key::PrivateKey>, hash_alg: Option<ssh_key::HashAlg>) -> Self;
    pub fn algorithm(&self) -> ssh_key::Algorithm;
    pub fn hash_alg(&self) -> Option<ssh_key::HashAlg>;
}
impl Deref for PrivateKeyWithHashAlg { type Target = ssh_key::PrivateKey; }
```

`new` forces `hash_alg = None` for non-RSA keys and maps `None` to legacy `ssh-rsa` (SHA-1) for RSA
keys. The recommended pattern for RSA (used verbatim in both client examples):

```rust
let key = russh::keys::load_secret_key(key_path, None)?;          // ssh_key::PrivateKey
let hash_alg = session.best_supported_rsa_hash().await?.flatten(); // Option<HashAlg>
let auth = session
    .authenticate_publickey(
        user,
        PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg),
    )
    .await?;
if !auth.success() { /* auth rejected */ }
```

(`PrivateKeyWithHashAlg` is reachable as `russh::keys::PrivateKeyWithHashAlg` and also
`russh::keys::key::PrivateKeyWithHashAlg`.)

Certificate auth instead takes `Arc<PrivateKey>` + `Certificate`:
`session.authenticate_openssh_cert(user, Arc::new(key), cert).await?`.

---

## 8. Crypto backend feature / defaults

From `Cargo.toml`:

```toml
[features]
default = ["flate2", "aws-lc-rs", "rsa"]
ring = ["dep:ring"]
aws-lc-rs = ["dep:aws-lc-rs"]
async-trait = ["dep:async-trait"]
rsa = ["dep:rsa", "dep:pkcs1", "ssh-key/rsa"]
# also: des, dsa, serde, legacy-ed25519-pkcs8-parser, _bench
```

- **Default backend is `aws-lc-rs`** (plus `flate2` and `rsa`). `ring` is opt-in.
- `src/lib.rs` hard-errors if neither is enabled:
  `compile_error!("`russh` requires enabling either the `ring` or `aws-lc-rs` feature as a crypto backend.")`.
- The backend choice is entirely internal. The only cfg gates are on internal cipher
  implementations (`src/cipher/gcm.rs`, `src/cipher/chacha20poly1305.rs`, `src/cipher/mod.rs`),
  written as `#[cfg(feature = "aws-lc-rs")]` / `#[cfg(all(not(feature = "aws-lc-rs"), feature = "ring"))]`.
  If both features are on, **aws-lc-rs wins**. There are **no public API differences** between
  `ring` and `aws-lc-rs`. (Confirmed by grepping every `feature = "ring"` / `feature = "aws-lc-rs"`
  occurrence in `src/`.)

---

## 9. Gotchas / notes

1. **`type Error` is the only mandatory trait item.** Every `Handler` method has a default; the
   `check_server_key` default returns `Ok(false)`, so a handler that doesn't override it can never
   connect (`client::connect` then returns `Err(H::Error::from(russh::Error::UnknownKey))`).
2. **`check_server_key` argument is `&russh::keys::PublicKeyOrCertificate`**, not
   `&ssh_key::PublicKey`. Use `.public_key()` (owned `ssh_key::PublicKey`) or `.certificate()`
   (`Option<&Certificate>`).
3. **`Handler: Sized + Send`, not `Sync`.** `connect` also needs `H: Send + 'static`.
   A `&mut self` handler works because the session loop owns it.
4. **`async_trait` is optional and off by default.** With default features the trait uses
   return-position `impl Future` and you implement methods as plain `async fn`. Even with the
   `async-trait` feature enabled, the same plain-`async fn` impl compiles (verified by building the
   exact example both with and without `features = ["async-trait"]`), because the trait's methods
   are declared with `-> impl Future + Send` rather than bare `async fn`. Do **not** need
   `use async_trait::async_trait;`.
5. **`russh::pty` is a private module.** Use `russh::Pty`; `russh::pty::Pty` will not compile.
6. **`Channel::data` takes an `AsyncRead`, not bytes.** `channel.data(&b"echo hi\n"[..]).await?`
   works because tokio implements `AsyncRead for &[u8]`. For owned data prefer
   `channel.data_bytes(bytes)`.
7. **No `wait_close`.** Drain with `while let Some(msg) = channel.wait().await { ... }`.
   `ChannelMsg` is `#[non_exhaustive]`; always keep a wildcard arm.
8. **`connect` returns `Result<Handle<H>, H::Error>`; `Handle` methods return
   `Result<_, russh::Error>`.** With `type Error = russh::Error` they unify.
9. **`session` must be `mut`** because `authenticate_password`/`authenticate_publickey` take
   `&mut self`, while `channel_open_session`/`disconnect` take `&self`.
10. **Name the error and key types via the right paths:** `russh::Error`,
    `russh::client::AuthResult` (there is no `russh::AuthResult`), `russh::keys::PublicKeyOrCertificate`,
    `russh::keys::{PrivateKeyWithHashAlg, load_secret_key, PrivateKey, PublicKey}`.
11. **`connect` takes `Arc<Config>`** and awaits key exchange before returning; a rejected server
    key therefore surfaces as an error from `connect` (not from a later call).
12. **`Config` and `Preferred` are not `#[non_exhaustive]`**, so `Config { inactivity_timeout: ...,
    ..Config::default() }` is valid. Edition 2024 / MSRV 1.89.
13. `Channel::wait` takes `&mut self` while `data`/`eof`/`window_change` take `&self`; to read and
    write concurrently, `channel.split()` into `ChannelReadHalf`/`ChannelWriteHalf<Msg>` or use
    `into_stream()`.

---

## 10. Complete verified example (password auth, pty 80x24, shell, echo)

This is the exact code that was compiled against russh 0.63.3 (default features) with zero errors.

```rust
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, Config, Handler};
use russh::keys::PublicKeyOrCertificate;
use russh::{ChannelMsg, Disconnect};

struct Client;

impl Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(true) // accept any server key (INSECURE: demo only)
    }
}

/// Connect, authenticate with a password, open a shell in an 80x24 pty,
/// send `echo hi`, and read a few bytes back.
pub async fn shell_session(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
) -> Result<(), russh::Error> {
    let config = Arc::new(Config {
        inactivity_timeout: Some(Duration::from_secs(30)),
        keepalive_interval: Some(Duration::from_secs(10)),
        ..Config::default()
    });

    let mut session = client::connect(config, (host, port), Client).await?;

    let auth_res = session.authenticate_password(user, password).await?;
    if !auth_res.success() {
        return Err(russh::Error::NotAuthenticated);
    }

    let mut channel = session.channel_open_session().await?;

    channel
        .request_pty(false, "xterm", 80, 24, 0, 0, &[])
        .await?;
    channel.request_shell(true).await?;

    channel.data(&b"echo hi\n"[..]).await?;

    let mut buf = Vec::new();
    while buf.len() < 8 {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => buf.extend_from_slice(&data),
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
            _ => {}
        }
    }
    println!("got: {:?}", String::from_utf8_lossy(&buf));

    channel.eof().await?;
    session
        .disconnect(Disconnect::ByApplication, "", "English")
        .await?;
    Ok(())
}
```

`client::connect(config, (host, port), Client)` requires `(&str, u16): tokio::net::ToSocketAddrs`,
which holds. The pty size setters want `u32`: literal `80, 24` infer `u32` from the signature.

### Public-key variant (also compiled)

```rust
use std::sync::Arc;
use russh::client::{self, Config, Handler};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};

// ... same `Client` handler as above ...

pub async fn key_session(
    host: &str,
    port: u16,
    user: &str,
    key_path: &std::path::Path,
) -> Result<(), russh::Error> {
    let key = load_secret_key(key_path, None)?; // ssh_key::PrivateKey; Some("pass") if encrypted
    let config = Arc::new(Config::default());
    let mut session = client::connect(config, (host, port), Client).await?;

    let hash_alg = session.best_supported_rsa_hash().await?.flatten(); // Option<HashAlg>
    let auth_res = session
        .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg))
        .await?;
    if !auth_res.success() {
        return Err(russh::Error::NotAuthenticated);
    }
    Ok(())
}
```

---

## Anything unconfirmed?

Nothing in this document is guessed. All type signatures were read from the vendored source and
the example code was actually compiled. Two points that cannot be inferred from source alone and
were therefore verified empirically by compiling:

- `russh::pty::Pty` is inaccessible (E0603) and `russh::Pty` works.
- `Channel::wait_close` does not exist (E0599).

The runtime behaviour of `echo hi` against a real server was **not** executed (no SSH server was
contacted); only compilation and API shape were verified.
