// @ts-check

import {
  natSafeMath,
  makeRatioFromAmounts,
} from '@agoric/zoe/src/contractSupport/index.js';
import { assert } from '@agoric/assert';
import { AmountMath } from '@agoric/ertp';

const { multiply, isGTE } = natSafeMath;

/** @typedef {import('./vault').VaultKit} VaultKit */

// Stores a collection of Vaults, pretending to be indexed by ratio of
// debt to collateral. Once performance is an issue, this should use Virtual
// Objects. For now, it uses a Map (Vault->debtToCollateral).
// debtToCollateral (which is not the collateralizationRatio) is updated using
// an observer on the UIState.

/**
 *
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {boolean}
 */
const ratioGTE = (left, right) => {
  assert(
    left.numerator.brand === right.numerator.brand &&
      left.denominator.brand === right.denominator.brand,
    `brands must match`,
  );
  return isGTE(
    multiply(left.numerator.value, right.denominator.value),
    multiply(right.numerator.value, left.denominator.value),
  );
};

/**
 *
 * @param {Amount} debtAmount
 * @param {Amount} collateralAmount
 * @returns {Ratio}
 */
const calculateDebtToCollateral = (debtAmount, collateralAmount) => {
  if (AmountMath.isEmpty(collateralAmount)) {
    return makeRatioFromAmounts(
      debtAmount,
      AmountMath.make(collateralAmount.brand, 1n),
    );
  }
  return makeRatioFromAmounts(debtAmount, collateralAmount);
};

/**
 *
 * @param {VaultKit} vaultKit
 * @returns {Ratio}
 */
const currentDebtToCollateral = vaultKit =>
  calculateDebtToCollateral(
    vaultKit.vault.getDebtAmount(),
    vaultKit.vault.getCollateralAmount(),
  );

/** @typedef {{debtToCollateral: Ratio, vaultKit: VaultKit}} VaultKitRecord */

/**
 * @param {VaultKitRecord} leftVaultPair
 * @param {VaultKitRecord} rightVaultPair
 * @returns {-1 | 0 | 1}
 */
const compareVaultKits = (leftVaultPair, rightVaultPair) => {
  const leftVaultRatio = leftVaultPair.debtToCollateral;
  const rightVaultRatio = rightVaultPair.debtToCollateral;
  const leftGTERight = ratioGTE(leftVaultRatio, rightVaultRatio);
  const rightGTEleft = ratioGTE(rightVaultRatio, leftVaultRatio);
  if (leftGTERight && rightGTEleft) {
    return 0;
  } else if (leftGTERight) {
    return -1;
  } else if (rightGTEleft) {
    return 1;
  }
  throw Error("The vault's collateral ratios are not comparable");
};

/**
 *
 * @param {() => void} reschedulePriceCheck called when there is a new
 * least-collateralized vault
 */
export const makePrioritizedVaults = reschedulePriceCheck => {
  // The array must be resorted on
  // every insert, and whenever any vault's ratio changes. We can remove an
  // arbitrary number of vaults from the front of the list without resorting. We
  // delete single entries using filter(), which leaves the array sorted.
  /** @type {VaultKitRecord[]} */
  let vaultsWithDebtRatio = [];

  // XXX why keep this state in PrioritizedVaults? Better in vaultManager?

  // To deal with fluctuating prices and varying collateralization, we schedule a
  // new request to the priceAuthority when some vault's debtToCollateral ratio
  // surpasses the current high-water mark. When the request that is at the
  // current high-water mark fires, we reschedule at the new highest ratio
  // (which should be lower, as we will have liquidated any that were at least
  // as high.)
  /** @type {Ratio=} */
  let highestDebtToCollateral;

  // Check if this ratio of debt to collateral would be the highest known. If
  // so, reset our highest and invoke the callback. This can be called on new
  // vaults and when we get a state update for a vault changing balances.
  /** @param {Ratio} collateralToDebt */
  const rescheduleIfHighest = collateralToDebt => {
    if (
      !highestDebtToCollateral ||
      !ratioGTE(highestDebtToCollateral, collateralToDebt)
    ) {
      highestDebtToCollateral = collateralToDebt;
      reschedulePriceCheck();
    }
  };

  const highestRatio = () => {
    const mostIndebted = vaultsWithDebtRatio[0];
    return mostIndebted ? mostIndebted.debtToCollateral : undefined;
  };

  /**
   *
   * @param {VaultId} vaultId
   * @returns {VaultKit}
   */
  const removeVault = vaultId => {
    console.log('removing', { vaultId });
    // FIXME actually remove
    // vaultsWithDebtRatio = vaultsWithDebtRatio.filter(
    //   v => v.vaultKit !== vaultKit,
    // );
    return vaultsWithDebtRatio[0].vaultKit;

    // don't call reschedulePriceCheck, but do reset the highest.
    // highestDebtToCollateral = highestRatio();
  };

  // TODO handle what this was doing
  // called after charging interest, which changes debts without affecting sort
  // const updateAllDebts = () => {
  //   // DEAD
  //   // vaultsWithDebtRatio.forEach((vaultPair, index) => {
  //   //   const debtToCollateral = currentDebtToCollateral(vaultPair.vaultKit);
  //   //   vaultsWithDebtRatio[index].debtToCollateral = debtToCollateral;
  //   // });

  //   // FIXME still need to track a "highest one" for the oracle
  //   // this basically "what's our outstanding ask of the oracle"
  //   // and we re-ask only if have something new to ask.
  //   // E.g. ask anew or update the ask with a new value.
  //   highestDebtToCollateral = highestRatio();
  // };

  // /**
  //  *
  //  * @param {VaultKit} vaultKit
  //  */
  // const makeObserver = (vaultKit) => ({
  //   updateState: (state) => {
  //     if (AmountMath.isEmpty(state.locked)) {
  //       return;
  //     }
  //     const debtToCollateral = currentDebtToCollateral(vaultKit);
  //     updateDebtRatio(vaultKit, debtToCollateral);
  //     vaultsWithDebtRatio.sort(compareVaultKits);
  //     rescheduleIfHighest(debtToCollateral);
  //   },
  //   finish: (_) => {
  //     removeVault(vaultKit);
  //   },
  //   fail: (_) => {
  //     removeVault(vaultKit);
  //   },
  // });

  /**
   *
   * @param {VaultId} vaultId
   * @param {VaultKit} vaultKit
   */
  const addVaultKit = (vaultId, vaultKit) => {
    // FIXME use the ordered store

    const debtToCollateral = currentDebtToCollateral(vaultKit);
    vaultsWithDebtRatio.push({ vaultKit, debtToCollateral });
    vaultsWithDebtRatio.sort(compareVaultKits);
    // observeNotifier(notifier, makeObserver(vaultKit));
    rescheduleIfHighest(debtToCollateral);
  };

  /**
   * Invoke a function for vaults with debt to collateral at or above the ratio
   *
   * @param {Ratio} ratio
   * @param {(record: VaultKitRecord) => void} func
   */
  const forEachRatioGTE = (ratio, func) => {
    // vaults are sorted with highest ratios first
    let index;
    for (index = 0; index < vaultsWithDebtRatio.length; index += 1) {
      const vaultPair = vaultsWithDebtRatio[index];
      if (ratioGTE(vaultPair.debtToCollateral, ratio)) {
        func(vaultPair);
      } else {
        // stop once we are below the target ratio
        break;
      }
    }

    if (index > 0) {
      vaultsWithDebtRatio = vaultsWithDebtRatio.slice(index);
      const highest = highestRatio();
      if (highest) {
        reschedulePriceCheck();
      }
    }
    highestDebtToCollateral = highestRatio();
  };

  /**
   *
   * @param {VaultId} vaultId
   */
  const refreshVaultPriority = vaultId => {
    const vault = removeVault(vaultId);
    addVaultKit(vaultId, vault);
  };

  const map = func => vaultsWithDebtRatio.map(func);

  const reduce = (func, init) => vaultsWithDebtRatio.reduce(func, init);

  return harden({
    addVaultKit,
    refreshVaultPriority,
    removeVault,
    map,
    reduce,
    forEachRatioGTE,
    highestRatio: () => highestDebtToCollateral,
  });
};
