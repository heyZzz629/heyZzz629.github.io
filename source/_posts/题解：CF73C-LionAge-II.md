---
title: 题解：CF73C LionAge II
date: 2026-03-09 20:19:42
tags:
---
思路：

$dp_{i,j,c}$ 它表示在前 $i$ 个字符中使用了 $j$ 次更改操作。

并且最后一个字符是 $c$ 的情况下所能达到的最大美丽度。

状态转移方程：

如果 $m=s[i-1]- \texttt a $：$ dp_{i,j,m}=\max\{dp_{i,j,m},dp_{i-1,j,q}+c_{q,m}\}$

如果 $m \ne s[i-1]-\texttt a$：$dp_{i,j,m}=\max\{dp_{i,j,m},dp_{i-1,j-1,q}+c_{q,m}\}$。

代码：

```cpp
#include<bits/stdc++.h>
#define int long long
using namespace std;
int c[26][26],dp[105][105][26],k,n,p,ans=INT_MIN;
string s;
char x,y;
signed main() {
	cin>>s>>k>>n;
    for(int i=1;i<=n;i++){
		cin>>x>>y>>p;
		c[x-'a'][y-'a']=p;
	}
	for(int i=1;i<=s.size();i++)
		for(int m=0;m<26;m++) dp[i][0][m]=-1e9;
	dp[1][0][s[0]-'a']=0;
	for(int i=2;i<=s.size();i++)
		for(int j=0;j<=k;j++)
			for(int m=0;m<26;m++)
				if(m==s[i-1]-'a')
					for(int q=0;q<26;q++) dp[i][j][m]=max(dp[i][j][m],dp[i-1][j][q]+c[q][m]);	
				else if(j)
					for(int q=0;q<26;q++) dp[i][j][m]=max(dp[i][j][m],dp[i-1][j-1][q]+c[q][m]);
    for(int m=0;m<26;m++) ans=max(ans,dp[s.size()][k][m]);
    cout<<ans<<endl;
    return 0;
}
```