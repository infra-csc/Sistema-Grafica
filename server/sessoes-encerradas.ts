import { EventEmitter } from "events";

// Avisa o tempo real quando as sessões de um usuário foram encerradas (exclusão,
// troca de senha, troca de perfil), para derrubar os sockets abertos dele.
export const sessoesEncerradas = new EventEmitter();

export function avisarSessoesEncerradas(userId: string) {
  sessoesEncerradas.emit("encerradas", userId);
}
