// CloudTerm · github.com/pilahito/cloudterm
// El cliente se parte en includes para poder parchear el handshake SSH
// (keyboard-interactive, IPv4 primero, fallback de PTY) sin reescribir
// el fichero entero en un solo blob.
include!("client_part1.rs");
include!("client_part2.rs");
include!("client_part3.rs");
include!("client_part4.rs");
