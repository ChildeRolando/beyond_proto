export class WinLossReward {
  compute(prevState, nextState, playerId) {
    const prevSelf = (prevState.characters || []).find(c => c.ownerId === playerId && c.alive !== false);
    const prevEnemy = (prevState.characters || []).find(c => c.ownerId !== playerId && c.alive !== false);
    const nextSelf = (nextState.characters || []).find(c => c.ownerId === playerId && c.alive !== false);
    const nextEnemy = (nextState.characters || []).find(c => c.ownerId !== playerId && c.alive !== false);

    // Only reward on transition (prev alive → next dead)
    const selfDied  = prevSelf  && !nextSelf;
    const enemyDied = prevEnemy && !nextEnemy;

    if (selfDied && enemyDied) return 0;   // draw
    if (enemyDied) return 1;                // win
    if (selfDied) return -1;                // lose
    return 0;                                // non-terminal
  }
}
